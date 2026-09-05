import pool from '../config/db.js';

const SELECT_FIELDS =
  'id, name, code, contact_person, phone, alternate_phone, address, city_area, customer_type, is_active, created_at, updated_at';

const UPDATABLE_COLUMNS = {
  name: 'name',
  code: 'code',
  contactPerson: 'contact_person',
  phone: 'phone',
  alternatePhone: 'alternate_phone',
  address: 'address',
  cityArea: 'city_area',
  customerType: 'customer_type',
  isActive: 'is_active',
};

export async function findCustomerById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM customers WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findCustomerByCode(code) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM customers WHERE code = $1`, [code]);
  return rows[0] || null;
}

export async function createCustomer(data) {
  const { rows } = await pool.query(
    `INSERT INTO customers (name, code, contact_person, phone, alternate_phone, address, city_area, customer_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SELECT_FIELDS}`,
    [
      data.name,
      data.code,
      data.contactPerson ?? null,
      data.phone ?? null,
      data.alternatePhone ?? null,
      data.address ?? null,
      data.cityArea ?? null,
      data.customerType ?? null,
    ]
  );
  return rows[0];
}

// Applies only the fields present in `data` (partial update).
export async function updateCustomer(id, data) {
  const setClauses = [];
  const params = [];

  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      params.push(data[field]);
      setClauses.push(`${column} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findCustomerById(id);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows[0] || null;
}

export async function deactivateCustomer(id) {
  const { rows } = await pool.query(
    `UPDATE customers SET is_active = false WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
    [id]
  );
  return rows[0] || null;
}

export async function listCustomers({ search, isActive, page, limit }) {
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM customers ${whereClause}`, params);
  const total = countResult.rows[0].total;

  const dataParams = [...params, limit, (page - 1) * limit];
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM customers ${whereClause}
     ORDER BY name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );

  return { rows, total };
}

export function toPublicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    code: customer.code,
    contactPerson: customer.contact_person,
    phone: customer.phone,
    alternatePhone: customer.alternate_phone,
    address: customer.address,
    cityArea: customer.city_area,
    customerType: customer.customer_type,
    isActive: customer.is_active,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
  };
}
