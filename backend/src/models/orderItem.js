import pool from '../config/db.js';

const INSERT_COLUMNS = [
  'order_id',
  'product_id',
  'product_name',
  'product_code',
  'mrp',
  'rate',
  'discount',
  'paid_qty',
  'bonus_qty',
  'scheme_purchase_qty',
  'scheme_bonus_qty',
  'line_subtotal',
  'line_discount',
  'line_total',
];

const SELECT_FIELDS =
  'id, order_id, product_id, product_name, product_code, mrp, rate, discount, paid_qty, bonus_qty, scheme_purchase_qty, scheme_bonus_qty, line_subtotal, line_discount, line_total, created_at, updated_at';

// Inserts every line of an order in one statement. Accepts an optional
// transaction `client` so the items land in the same transaction as the
// order row itself — an order must never exist with only some of its lines
// saved (PROJECT_SPEC.md §30).
//
// This layer stores what it is given: the caller has already snapshotted
// every commercial value (see utils/orderPricing.js). Nothing here computes
// a price, a discount, or a bonus quantity.
export async function createOrderItems(orderId, lines, client = pool) {
  if (lines.length === 0) {
    return [];
  }

  const params = [];
  const valueGroups = lines.map((line) => {
    const offset = params.length;
    params.push(
      orderId,
      line.productId,
      line.productName,
      line.productCode,
      line.mrp,
      line.rate,
      line.discount,
      line.paidQty,
      line.bonusQty,
      line.schemePurchaseQty ?? null,
      line.schemeBonusQty ?? null,
      line.lineSubtotal,
      line.lineDiscount,
      line.lineTotal
    );
    return `(${INSERT_COLUMNS.map((_, index) => `$${offset + index + 1}`).join(', ')})`;
  });

  const { rows } = await client.query(
    `INSERT INTO order_items (${INSERT_COLUMNS.join(', ')})
     VALUES ${valueGroups.join(', ')}
     RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows;
}

// Ordered by product name: all the lines of one order are inserted in a
// single transaction and therefore share the same created_at, so that
// column can't give a stable order on its own. Sorting by the snapshotted
// name keeps every view of an order (details, re-order, reports) listing
// its lines identically.
export async function findOrderItemsByOrderId(orderId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${SELECT_FIELDS} FROM order_items WHERE order_id = $1 ORDER BY product_name ASC, id ASC`,
    [orderId]
  );
  return rows;
}

export function toPublicOrderItem(item) {
  return {
    id: item.id,
    orderId: item.order_id,
    productId: item.product_id,
    productName: item.product_name,
    productCode: item.product_code,
    mrp: Number(item.mrp),
    rate: Number(item.rate),
    discount: Number(item.discount),
    paidQty: item.paid_qty,
    bonusQty: item.bonus_qty,
    schemePurchaseQty: item.scheme_purchase_qty,
    schemeBonusQty: item.scheme_bonus_qty,
    lineSubtotal: Number(item.line_subtotal),
    lineDiscount: Number(item.line_discount),
    lineTotal: Number(item.line_total),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}
