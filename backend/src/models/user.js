import pool from '../config/db.js';

const SELECT_FIELDS =
  'id, name, username, password_hash, phone, company_name, is_active, created_at, updated_at';

export async function findUserByUsername(username) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE username = $1`, [username]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Creates a booker. `passwordHash` must already be hashed — this layer
// never sees a plaintext password (PROJECT_SPEC.md §32).
export async function createUser({ name, username, passwordHash, phone, companyName }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, username, password_hash, phone, company_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_FIELDS}`,
    [name, username, passwordHash, phone ?? null, companyName]
  );
  return rows[0];
}

export async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  return rows[0].total;
}

// Sets the company name across EVERY account on this installation.
//
// Deliberately not per-user. This application is a standalone system for one
// distribution business (PROJECT_SPEC.md §1), and the company name is what
// brands it — the sidebar and every printed order receipt. Two bookers at
// the same firm printing receipts headed with different names would be a
// bug, not a feature, so renaming the business renames it for everyone.
//
// It lives on `users` because that is where registration captures it; there
// is no settings table and §27 warns against inventing one for a single
// value.
export async function setCompanyNameForAllUsers(companyName) {
  const { rowCount } = await pool.query('UPDATE users SET company_name = $1', [companyName]);
  return rowCount;
}

// Every booker, for the Orders module's Booker filter (PROJECT_SPEC.md
// §17). Inactive bookers are included: they still own historical orders,
// which must stay findable.
export async function listUsers() {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users ORDER BY name ASC`);
  return rows;
}

// Strips password_hash before a user record is ever sent in an API response.
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    phone: user.phone,
    // The distribution business this booker works for — brands the sidebar
    // and the order receipt. Null on accounts created before the field
    // existed; the UI falls back rather than showing an empty header.
    companyName: user.company_name ?? null,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
