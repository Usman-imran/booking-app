import pool from '../config/db.js';

// Every customer belongs to exactly one user (owner_id) and is invisible to
// everyone else. Each function here takes the owner explicitly and folds it
// into the WHERE clause, so a customer id belonging to another account
// behaves exactly like one that doesn't exist. Nothing in this file can be
// called without saying whose data it is.
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

// Accepts an optional transaction `client` so callers that must read the
// customer inside their own transaction (order creation) can do so on the
// same connection instead of a separate pooled one.
export async function findCustomerById(ownerId, id, client = pool) {
  const { rows } = await client.query(`SELECT ${SELECT_FIELDS} FROM customers WHERE owner_id = $1 AND id = $2`, [
    ownerId,
    id,
  ]);
  return rows[0] || null;
}

// Codes are unique per owner, not globally, so the lookup is scoped too.
export async function findCustomerByCode(ownerId, code) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM customers WHERE owner_id = $1 AND code = $2`, [
    ownerId,
    code,
  ]);
  return rows[0] || null;
}

export async function createCustomer(ownerId, data) {
  const { rows } = await pool.query(
    `INSERT INTO customers (owner_id, name, code, contact_person, phone, alternate_phone, address, city_area, customer_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SELECT_FIELDS}`,
    [
      ownerId,
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
export async function updateCustomer(ownerId, id, data) {
  const setClauses = [];
  const params = [];

  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      params.push(data[field]);
      setClauses.push(`${column} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findCustomerById(ownerId, id);
  }

  params.push(ownerId, id);
  const { rows } = await pool.query(
    `UPDATE customers SET ${setClauses.join(', ')}
     WHERE owner_id = $${params.length - 1} AND id = $${params.length}
     RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows[0] || null;
}

export async function deactivateCustomer(ownerId, id) {
  const { rows } = await pool.query(
    `UPDATE customers SET is_active = false WHERE owner_id = $1 AND id = $2 RETURNING ${SELECT_FIELDS}`,
    [ownerId, id]
  );
  return rows[0] || null;
}

export async function listCustomers(ownerId, { search, isActive, cityArea, page, limit }) {
  const params = [ownerId];
  const conditions = ['owner_id = $1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    conditions.push(`is_active = ${params.length}`);
  }

  // Exact area, case- and space-insensitive: "Gulberg" matches " gulberg".
  if (cityArea) {
    params.push(cityArea);
    conditions.push(`lower(btrim(city_area)) = lower(btrim(${params.length}))`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

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

// The distinct city/areas this account's customers are in, with how many
// customers each, for the area filter. Spelled as most customers spell it.
export async function listCustomerAreas(ownerId) {
  const { rows } = await pool.query(
    `SELECT mode() WITHIN GROUP (ORDER BY btrim(city_area)) AS area, COUNT(*)::int AS customers
       FROM customers
      WHERE owner_id = $1 AND city_area IS NOT NULL AND btrim(city_area) <> ''
      GROUP BY lower(btrim(city_area))
      ORDER BY customers DESC, area ASC`,
    [ownerId]
  );
  return rows;
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
