import pool from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { reserveNextOrderNumber } from '../utils/orderNumber.js';
import { buildOrderLine, sumOrderTotals, MAX_AMOUNT } from '../utils/orderPricing.js';
import { findCustomerById } from './customer.js';
import { findProductsByIds, toPublicProduct } from './product.js';
import { createOrderItems, findOrderItemsByOrderId } from './orderItem.js';

// An order belongs to the user who booked it (booker_id) and is invisible to
// everyone else. Every function here takes that owner explicitly and folds
// it into the WHERE clause, so an order id belonging to another account
// behaves exactly like one that doesn't exist. The customer and products an
// order references are looked up within the same owner's data, so an order
// can never be built from — or point at — someone else's records.
const SELECT_FIELDS =
  'id, order_number, customer_id, booker_id, status, remarks, subtotal, discount_total, total, submitted_at, cancelled_at, cancelled_by, created_at, updated_at';

// The same column list qualified for the joined list/details queries below,
// derived from SELECT_FIELDS so the two can never drift apart.
const ORDER_FIELDS_QUALIFIED = SELECT_FIELDS.split(', ')
  .map((field) => `o.${field}`)
  .join(', ');

// Joined once here so a listed/fetched order always carries the display
// values every Orders view needs (PROJECT_SPEC.md §17), instead of the API
// layer issuing a lookup per row.
const ORDER_JOINS = `
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  JOIN users b ON b.id = o.booker_id
  -- Only set on a cancelled order, so this join must not drop rows.
  LEFT JOIN users cb ON cb.id = o.cancelled_by`;

const ORDER_JOINED_FIELDS = `${ORDER_FIELDS_QUALIFIED},
    c.name AS customer_name, c.code AS customer_code, c.phone AS customer_phone,
    c.address AS customer_address, c.city_area AS customer_city_area,
    b.name AS booker_name, b.username AS booker_username,
    cb.name AS cancelled_by_name`;

// Creates an empty draft order (no line items, zero totals). Drafts never
// have an order number — see submitOrder(). Orders created through the API
// go through createOrderWithItems() below; this remains the minimal
// schema-level helper.
export async function createOrder({ customerId, bookerId, remarks }) {
  // The customer must be the booker's own; a foreign id is a 400, the
  // same as a missing one.
  if (!(await findCustomerById(bookerId, customerId))) {
    throw new ApiError(400, 'Customer not found.');
  }

  const { rows } = await pool.query(
    `INSERT INTO orders (customer_id, booker_id, remarks)
     VALUES ($1, $2, $3)
     RETURNING ${SELECT_FIELDS}`,
    [customerId, bookerId, remarks ?? null]
  );
  return rows[0];
}

// Creates a complete order — header, line items, totals, and (when
// submitted) its order number — in ONE transaction (PROJECT_SPEC.md §30).
// Either the whole order lands or nothing does; there is no path that
// leaves a half-saved order behind.
//
// Everything commercial is decided HERE, on the server, from the products'
// current values: the caller supplies only `{ productId, quantity }` per
// line. A client can never dictate a rate, a discount, or a bonus quantity.
//
// The customer/product lookups deliberately run on the transaction's own
// client, so the values snapshotted into the order items are read on the
// same connection, inside the same transaction, that writes them.
//
// `status`: 'draft' saves the order for later and consumes no order number;
// 'submitted' finalizes it — number reserved and `submitted_at` stamped in
// this same transaction (PROJECT_SPEC.md §11, §13).
// Validates the customer and turns `{ productId, quantity }` into fully
// priced, fully snapshotted order lines plus the order's totals.
//
// Shared by order creation and draft editing so the two can never price an
// order differently. Runs on the caller's transaction client, so the values
// it reads are read on the same connection, inside the same transaction,
// that will write them.
async function buildOrderContents(client, { ownerId, customerId, items }) {
  const customer = await findCustomerById(ownerId, customerId, client);
  if (!customer) {
    throw new ApiError(400, 'Customer not found.');
  }
  if (!customer.is_active) {
    throw new ApiError(400, 'Customer is inactive and cannot be used for an order.');
  }

  // One lookup for every referenced product, then a snapshot per line.
  const productRows = await findProductsByIds(
    ownerId,
    items.map((item) => item.productId),
    client
  );
  const productsById = new Map(productRows.map((row) => [row.id, row]));

  const lines = items.map((item) => {
    const row = productsById.get(item.productId);
    if (!row) {
      throw new ApiError(400, `Product not found: ${item.productId}`);
    }
    if (!row.is_active) {
      throw new ApiError(400, `Product is inactive and cannot be ordered: ${row.name}`);
    }
    return buildOrderLine(toPublicProduct(row), item.quantity, { discount: item.discount });
  });

  const totals = sumOrderTotals(lines);
  // Caught here rather than letting a numeric(14,2) overflow surface as a
  // database error; the amounts involved are far past anything real.
  if (totals.subtotal > MAX_AMOUNT) {
    throw new ApiError(400, 'Order total is too large.');
  }

  return { lines, totals };
}

//
// `clientRef`: optional idempotency key sent by the app (see the
// add-client-ref-to-orders migration). A repeat trips the
// orders_booker_client_ref_key constraint - rolling back everything above,
// the reserved order number included - and the route replays the existing
// order instead.
export async function createOrderWithItems({ customerId, bookerId, status, remarks, items, clientRef }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { lines, totals } = await buildOrderContents(client, { ownerId: bookerId, customerId, items });

    // Reserved as late as possible: this takes a lock on the day's counter
    // row that is held until COMMIT, and every other caller submitting
    // today waits behind it (see utils/orderNumber.js). Drafts skip it
    // entirely and never contend.
    const orderNumber = status === 'submitted' ? await reserveNextOrderNumber(client, bookerId) : null;

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (order_number, customer_id, booker_id, status, remarks, subtotal, discount_total, total, submitted_at, client_ref)
       -- $4 is explicitly cast because it is used both as a varchar column
       -- value and in a text comparison, which PostgreSQL will not infer a
       -- single type for. submitted_at uses the database clock, so it can
       -- never disagree with the order number reserved above.
       VALUES ($1, $2, $3, $4::text, $5, $6, $7, $8, CASE WHEN $4::text = 'submitted' THEN now() ELSE NULL END, $9)
       RETURNING ${SELECT_FIELDS}`,
      [
        orderNumber,
        customerId,
        bookerId,
        status,
        remarks ?? null,
        totals.subtotal,
        totals.discountTotal,
        totals.total,
        clientRef ?? null,
      ]
    );
    const order = orderRows[0];

    await createOrderItems(order.id, lines, client);

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// The id of the booker's order created under this idempotency key, or null.
export async function findOrderIdByClientRef(ownerId, clientRef) {
  const { rows } = await pool.query('SELECT id FROM orders WHERE booker_id = $1 AND client_ref = $2', [
    ownerId,
    clientRef,
  ]);
  return rows[0]?.id ?? null;
}

export async function findOrderById(ownerId, id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM orders WHERE booker_id = $1 AND id = $2`, [
    ownerId,
    id,
  ]);
  return rows[0] || null;
}

// How many orders are sitting in a given status. The Dashboard needs the
// draft/pending count (PROJECT_SPEC.md §3) and only the number, so this
// avoids fetching a page of rows just to read a total off it.
export async function countOrdersByStatus(ownerId, statuses) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM orders WHERE booker_id = $1 AND status = ANY($2::text[])`,
    [ownerId, statuses]
  );
  return rows[0].total;
}

// Full order details: the order with its customer/booker information and
// every line item (PROJECT_SPEC.md §17).
export async function findOrderDetailsById(ownerId, id) {
  const { rows } = await pool.query(
    `SELECT ${ORDER_JOINED_FIELDS} ${ORDER_JOINS} WHERE o.booker_id = $1 AND o.id = $2`,
    [ownerId, id]
  );
  const order = rows[0];
  if (!order) {
    return null;
  }

  const items = await findOrderItemsByOrderId(order.id);
  return { order, items };
}

// Paginated, filtered order list (PROJECT_SPEC.md §17: all orders, today's
// orders, search, and date/customer/booker/status filters).
//
// `dateFrom`/`dateTo` are inclusive calendar dates matched against the
// order's own date: when it was SUBMITTED for a submitted or cancelled
// order, falling back to when it was created for a draft, which has no
// submission date yet. That is the date this list displays, the date the
// order's ORD-YYYYMMDD-XXX number was issued against, and the date Sales
// Reports count the sale on (see models/report.js) — so no two screens can
// disagree about which day an order belongs to. Compared in the database's
// own timezone, the same reference the daily number sequence resets on.
// An order's date for filtering. Deliberately identical to the sale date
// Sales Reports use (models/report.js) for anything already submitted.
const ORDER_DATE = 'COALESCE(o.submitted_at, o.created_at)';

export async function listOrders(ownerId, { search, statuses, customerId, dateFrom, dateTo, page, limit }) {
  const params = [ownerId];
  const conditions = ['o.booker_id = $1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.code ILIKE $${params.length})`
    );
  }

  // One status or several: the Orders module shows submitted and cancelled
  // orders together (PROJECT_SPEC.md §17), while Draft Orders asks for
  // drafts alone.
  if (statuses && statuses.length > 0) {
    params.push(statuses);
    conditions.push(`o.status = ANY($${params.length}::text[])`);
  }

  if (customerId) {
    params.push(customerId);
    conditions.push(`o.customer_id = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${ORDER_DATE}::date >= $${params.length}::date`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${ORDER_DATE}::date <= $${params.length}::date`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${ORDER_JOINS} ${whereClause}`, params);
  const total = countResult.rows[0].total;

  const dataParams = [...params, limit, (page - 1) * limit];
  const { rows } = await pool.query(
    `SELECT ${ORDER_JOINED_FIELDS},
       (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     ${ORDER_JOINS}
     ${whereClause}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );

  return { rows, total };
}

// Replaces a draft's entire contents — customer, remarks and every line —
// in one transaction (PROJECT_SPEC.md §13: edit draft / continue order).
//
// ONLY drafts can be changed. A submitted order is immutable
// (PROJECT_SPEC.md §14), and `SELECT ... FOR UPDATE` holds the row for the
// whole transaction, so a draft can't be edited and submitted at the same
// moment and end up with contents nobody reviewed.
//
// The lines are re-priced from the products' CURRENT values rather than
// carried over from the saved snapshot. That's the same rule the order
// followed when it was first built (PROJECT_SPEC.md §6: the price at the
// moment the product is added is what's copied in), and it's what makes a
// draft picked up days later go out at today's prices instead of stale
// ones. Nothing is locked until the draft is submitted.
//
// The booker who created the order is never reassigned by an edit.
export async function updateDraftOrder({ ownerId, orderId, customerId, remarks, items }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      'SELECT id, status FROM orders WHERE booker_id = $1 AND id = $2 FOR UPDATE',
      [ownerId, orderId]
    );
    const existing = existingRows[0];

    if (!existing) {
      throw new ApiError(404, 'Order not found.');
    }
    if (existing.status !== 'draft') {
      throw new ApiError(409, `Only draft orders can be edited (this order is ${existing.status}).`);
    }

    const { lines, totals } = await buildOrderContents(client, { ownerId, customerId, items });

    // Replace rather than reconcile: the request carries the draft's full
    // contents, so working out per-line inserts/updates/deletes would add
    // moving parts without changing the result.
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    await createOrderItems(orderId, lines, client);

    const { rows } = await client.query(
      `UPDATE orders
       SET customer_id = $1, remarks = $2, subtotal = $3, discount_total = $4, total = $5
       WHERE id = $6
       RETURNING ${SELECT_FIELDS}`,
      [customerId, remarks ?? null, totals.subtotal, totals.discountTotal, totals.total, orderId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Deletes a draft outright, along with its items (the order_items foreign
// key cascades). This is the one order the application is allowed to
// physically remove: submitted and cancelled orders are kept forever
// (PROJECT_SPEC.md §12), which the status check below enforces.
//
// A deleted draft never had an order number, so nothing is orphaned and no
// number is lost.
export async function deleteDraftOrder(ownerId, orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      `SELECT ${SELECT_FIELDS} FROM orders WHERE booker_id = $1 AND id = $2 FOR UPDATE`,
      [ownerId, orderId]
    );
    const existing = existingRows[0];

    if (!existing) {
      throw new ApiError(404, 'Order not found.');
    }
    if (existing.status !== 'draft') {
      throw new ApiError(409, `Only draft orders can be deleted (this order is ${existing.status}). Submitted orders are kept permanently and can only be cancelled.`);
    }

    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);

    await client.query('COMMIT');
    return existing;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Draft -> Submitted (PROJECT_SPEC.md §13). The draft's final order number
// is reserved and assigned in the same transaction as the status change, so
// a failure rolls both back together and the reserved number is cleanly
// reclaimed for the next caller (see reserveNextOrderNumber's doc comment).
// `SELECT ... FOR UPDATE` also stops the same draft from being submitted
// twice concurrently — two clicks can only ever produce one order number.
//
// The draft's stored line snapshots are what get locked in; submitting
// doesn't re-price them. Re-pricing happens when a draft is edited (see
// updateDraftOrder), which is what "Continue Draft" does.
export async function submitOrder(ownerId, orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      'SELECT id, status FROM orders WHERE booker_id = $1 AND id = $2 FOR UPDATE',
      [ownerId, orderId]
    );
    const existing = existingRows[0];

    if (!existing) {
      throw new ApiError(404, 'Order not found.');
    }
    if (existing.status !== 'draft') {
      throw new ApiError(409, `Only draft orders can be submitted (this order is ${existing.status}).`);
    }

    // An order needs at least one product before it can be submitted
    // (PROJECT_SPEC.md §26). A draft is allowed to be empty while it's
    // being built; this is where that stops being acceptable.
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM order_items WHERE order_id = $1',
      [orderId]
    );
    if (countRows[0].n === 0) {
      throw new ApiError(400, 'Add at least one product before submitting this draft.');
    }

    const orderNumber = await reserveNextOrderNumber(client, ownerId);

    const { rows } = await client.query(
      `UPDATE orders
       SET status = 'submitted', order_number = $1, submitted_at = now()
       WHERE id = $2
       RETURNING ${SELECT_FIELDS}`,
      [orderNumber, orderId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Submitted -> Cancelled (PROJECT_SPEC.md §15). The complete original order
// is preserved: nothing is deleted, no line is touched, and the order
// number stays exactly where it is, so a cancelled order keeps its identity
// in history and that number is never reissued.
//
// Only a submitted order can be cancelled — a draft is deleted instead, and
// cancelling twice is refused. `SELECT ... FOR UPDATE` holds the row for the
// transaction so two simultaneous cancellations can't both record
// themselves as the one that did it.
//
// `cancelled_at` and `cancelled_by` are stamped together with the status;
// the database's check constraint would reject the row if any of the three
// were missing (PROJECT_SPEC.md §33).
// Only the order's own booker can cancel it — the same user who is the
// order's owner, so `cancelled_by` is always that user.
export async function cancelOrder(ownerId, orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      'SELECT id, status FROM orders WHERE booker_id = $1 AND id = $2 FOR UPDATE',
      [ownerId, orderId]
    );
    const existing = existingRows[0];

    if (!existing) {
      throw new ApiError(404, 'Order not found.');
    }
    if (existing.status === 'cancelled') {
      throw new ApiError(409, 'This order has already been cancelled.');
    }
    if (existing.status !== 'submitted') {
      throw new ApiError(409, `Only submitted orders can be cancelled (this order is ${existing.status}). A draft is deleted rather than cancelled.`);
    }

    const { rows } = await client.query(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = $1
       WHERE id = $2
       RETURNING ${SELECT_FIELDS}`,
      [ownerId, orderId]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Rows from listOrders()/findOrderDetailsById() carry joined customer and
// booker columns; rows from the plain helpers don't. The nested objects are
// added only when those columns are actually present, so one shaping
// function serves both.
export function toPublicOrder(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
    bookerId: order.booker_id,
    status: order.status,
    remarks: order.remarks,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discount_total),
    total: Number(order.total),
    submittedAt: order.submitted_at,
    cancelledAt: order.cancelled_at,
    cancelledBy: order.cancelled_by,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    ...(order.customer_name !== undefined && {
      customer: {
        id: order.customer_id,
        name: order.customer_name,
        code: order.customer_code,
        phone: order.customer_phone,
        address: order.customer_address,
        cityArea: order.customer_city_area,
      },
    }),
    ...(order.booker_name !== undefined && {
      booker: {
        id: order.booker_id,
        name: order.booker_name,
        username: order.booker_username,
      },
    }),
    ...(order.cancelled_by_name !== undefined && {
      cancelledByName: order.cancelled_by_name,
    }),
    ...(order.item_count !== undefined && { itemCount: order.item_count }),
  };
}
