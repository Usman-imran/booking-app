import pool from '../config/db.js';

const SELECT_FIELDS = 'id, name, username, password_hash, phone, is_active, created_at, updated_at';

export async function findUserByUsername(username) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE username = $1`, [username]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Strips password_hash before a user record is ever sent in an API response.
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    phone: user.phone,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
