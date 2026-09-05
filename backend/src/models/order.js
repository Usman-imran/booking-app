import pool from '../config/db.js';
import { reserveNextOrderNumber } from '../utils/orderNumber.js';

const SELECT_FIELDS =
  'id, order_number, customer_id, booker_id, status, remarks, subtotal, discount_total, total, submitted_at, cancelled_at, cancelled_by, created_at, updated_at';

// Creates a new draft order. Drafts never have an order number — see
// submitOrder(). Full order-creation business logic (line items, computed
// totals) belongs to the Order API in a later stage; this is schema-level
// access only.
export async function createOrder({ customerId, bookerId, remarks }) {
  const { rows } = await pool.query(
    `INSERT INTO orders (customer_id, booker_id, remarks)
     VALUES ($1, $2, $3)
     RETURNING ${SELECT_FIELDS}`,
    [customerId, bookerId, remarks ?? null]
  );
  return rows[0];
}

export async function findOrderById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM orders WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Draft -> Submitted. This is the order numbering system's only entry
// point: a number is reserved and assigned in the same transaction as the
// status change, so a failure here rolls both back together and the
// reserved number is cleanly reclaimed for the next caller (see
// reserveNextOrderNumber's doc comment). `SELECT ... FOR UPDATE` also stops
// the same draft from being submitted twice concurrently.
export async function submitOrder(orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [
      orderId,
    ]);
    const existing = existingRows[0];

    if (!existing) {
      throw new Error('Order not found.');
    }
    if (existing.status !== 'draft') {
      throw new Error(`Only draft orders can be submitted (current status: ${existing.status}).`);
    }

    const orderNumber = await reserveNextOrderNumber(client);

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

// Submitted -> Cancelled. The order number is never touched, so it is
// retained on the cancelled order and never reused.
export async function cancelOrder(orderId, cancelledByUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [
      orderId,
    ]);
    const existing = existingRows[0];

    if (!existing) {
      throw new Error('Order not found.');
    }
    if (existing.status !== 'submitted') {
      throw new Error(`Only submitted orders can be cancelled (current status: ${existing.status}).`);
    }

    const { rows } = await client.query(
      `UPDATE orders
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = $1
       WHERE id = $2
       RETURNING ${SELECT_FIELDS}`,
      [cancelledByUserId, orderId]
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
  };
}
