import pool from '../config/db.js';

const SELECT_FIELDS =
  'id, name, code, company, packing, unit, mrp, sale_price, discount, scheme_enabled, scheme_purchase_qty, scheme_bonus_qty, is_active, created_at, updated_at';

const UPDATABLE_COLUMNS = {
  name: 'name',
  code: 'code',
  company: 'company',
  packing: 'packing',
  unit: 'unit',
  mrp: 'mrp',
  salePrice: 'sale_price',
  discount: 'discount',
  schemeEnabled: 'scheme_enabled',
  schemePurchaseQty: 'scheme_purchase_qty',
  schemeBonusQty: 'scheme_bonus_qty',
  isActive: 'is_active',
};

export async function findProductById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findProductByCode(code) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE code = $1`, [code]);
  return rows[0] || null;
}

export async function createProduct(data) {
  const { rows } = await pool.query(
    `INSERT INTO products (name, code, company, packing, unit, mrp, sale_price, discount, scheme_enabled, scheme_purchase_qty, scheme_bonus_qty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_FIELDS}`,
    [
      data.name,
      data.code,
      data.company ?? null,
      data.packing ?? null,
      data.unit ?? null,
      data.mrp,
      data.salePrice,
      data.discount,
      data.schemeEnabled,
      data.schemePurchaseQty,
      data.schemeBonusQty,
    ]
  );
  return rows[0];
}

// Applies only the fields present in `data` (partial update).
export async function updateProduct(id, data) {
  const setClauses = [];
  const params = [];

  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      params.push(data[field]);
      setClauses.push(`${column} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findProductById(id);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows[0] || null;
}

export async function deactivateProduct(id) {
  const { rows } = await pool.query(
    `UPDATE products SET is_active = false WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
    [id]
  );
  return rows[0] || null;
}

export async function listProducts({ search, isActive, page, limit }) {
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM products ${whereClause}`, params);
  const total = countResult.rows[0].total;

  const dataParams = [...params, limit, (page - 1) * limit];
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM products ${whereClause}
     ORDER BY name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );

  return { rows, total };
}

export function toPublicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    company: product.company,
    packing: product.packing,
    unit: product.unit,
    mrp: Number(product.mrp),
    salePrice: Number(product.sale_price),
    discount: Number(product.discount),
    schemeEnabled: product.scheme_enabled,
    schemePurchaseQty: product.scheme_purchase_qty,
    schemeBonusQty: product.scheme_bonus_qty,
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}
