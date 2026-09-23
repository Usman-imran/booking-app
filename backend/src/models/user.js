import pool from '../config/db.js';
import { isPro, planOf } from '../utils/plan.js';

const SELECT_FIELDS =
  'id, name, username, password_hash, phone, company_name, tagline, pro_until, is_active, created_at, updated_at';
// Plus the receipt logo, which can run to a few hundred KB: read only where
// the profile is sent back to the app, never on the per-request auth lookup.
const PROFILE_FIELDS = `${SELECT_FIELDS}, logo`;

export async function findUserByUsername(username) {
  const { rows } = await pool.query(`SELECT ${PROFILE_FIELDS} FROM users WHERE username = $1`, [username]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// The same user with the logo included - for responses that return the
// profile to the app.
export async function findUserProfileById(id) {
  const { rows } = await pool.query(`SELECT ${PROFILE_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Creates a booker. `passwordHash` must already be hashed — this layer
// never sees a plaintext password (PROJECT_SPEC.md §32).
export async function createUser({ name, username, passwordHash, phone, companyName, tagline }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, username, password_hash, phone, company_name, tagline)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PROFILE_FIELDS}`,
    [name, username, passwordHash, phone ?? null, companyName, tagline ?? null]
  );
  return rows[0];
}

// Sets how ONE account's business presents itself: its name and the
// tagline printed under it on receipts. Every account is its own isolated
// workspace, so this branding is theirs alone to set. A null tagline
// clears it, and the receipt falls back to its default line.
//
// It lives on `users` because that is where registration captures it; there
// is no settings table and §27 warns against inventing one for two values.
export async function setCompanyProfile(userId, { companyName, tagline }) {
  const { rows } = await pool.query(
    `UPDATE users SET company_name = $1, tagline = $2 WHERE id = $3 RETURNING ${PROFILE_FIELDS}`,
    [companyName, tagline ?? null, userId]
  );
  return rows[0] || null;
}

// Sets (or, with null, removes) the account's receipt logo. Pro-only - the
// route checks the plan before calling this.
export async function setLogo(userId, logo) {
  const { rows } = await pool.query(`UPDATE users SET logo = $1 WHERE id = $2 RETURNING ${PROFILE_FIELDS}`, [logo, userId]);
  return rows[0] || null;
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
    // The line under the company name on receipts; null means "use the
    // default".
    tagline: user.tagline ?? null,
    // 'pro' while pro_until is in the future, else 'free' (utils/plan.js).
    plan: planOf(user),
    proUntil: user.pro_until ?? null,
    // The receipt logo, only while Pro: a lapsed subscription keeps the
    // stored logo (it comes back on renewal) but stops printing it. Null
    // on rows read without it, e.g. the per-request auth user.
    logo: isPro(user) ? (user.logo ?? null) : null,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
