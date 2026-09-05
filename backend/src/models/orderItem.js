import pool from '../config/db.js';

const SELECT_FIELDS =
  'id, order_id, product_id, product_name, product_code, mrp, rate, discount, paid_qty, bonus_qty, scheme_purchase_qty, scheme_bonus_qty, line_subtotal, line_discount, line_total, created_at, updated_at';

// Inserts one line item. Every commercial value is expected to already be a
// snapshot taken at order time by the caller — this layer does not compute
// pricing, discounts, or bonus quantities (that belongs to the Order API).
export async function createOrderItem(data) {
  const { rows } = await pool.query(
    `INSERT INTO order_items (
       order_id, product_id, product_name, product_code, mrp, rate, discount,
       paid_qty, bonus_qty, scheme_purchase_qty, scheme_bonus_qty,
       line_subtotal, line_discount, line_total
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${SELECT_FIELDS}`,
    [
      data.orderId,
      data.productId,
      data.productName,
      data.productCode,
      data.mrp,
      data.rate,
      data.discount,
      data.paidQty,
      data.bonusQty,
      data.schemePurchaseQty ?? null,
      data.schemeBonusQty ?? null,
      data.lineSubtotal,
      data.lineDiscount,
      data.lineTotal,
    ]
  );
  return rows[0];
}

export async function findOrderItemsByOrderId(orderId) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
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
