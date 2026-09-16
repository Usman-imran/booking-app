// Concurrency-safe ORD-YYYYMMDD-XXX order number generation
// (PROJECT_SPEC.md §11).
//
// The whole scheme rests on one atomic UPSERT against a counter table with
// one row per owner per day. Every user has their own daily sequence — two
// accounts can each issue ORD-20260915-001 — so concurrent callers only
// serialize on the row's lock when they are the SAME owner submitting on
// the same day (Postgres blocks the second UPSERT until the first commits
// or rolls back); different owners or days never contend at all.
//
// IMPORTANT: `client` must be a connection that is inside the SAME
// transaction as whatever else is happening for this order submission
// (e.g. via `pool.connect()` + BEGIN, not the shared `pool` directly). That
// is what makes a failed/rolled-back submission harmless: if the caller's
// transaction rolls back, this increment rolls back with it, and the next
// caller gets that exact number back rather than a permanent gap.
export const MAX_DAILY_SEQUENCE = 999;
export const ORDER_NUMBER_EXHAUSTED = 'ORDER_NUMBER_EXHAUSTED';
export const ORDER_NUMBER_RE = /^ORD-\d{8}-\d{3}$/;

export async function reserveNextOrderNumber(client, ownerId) {
  const { rows } = await client.query(
    `INSERT INTO order_number_counters (owner_id, counter_date, last_sequence)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (owner_id, counter_date)
     DO UPDATE SET last_sequence = order_number_counters.last_sequence + 1
     RETURNING to_char(counter_date, 'YYYYMMDD') AS date_key, last_sequence`,
    [ownerId]
  );

  const { date_key: dateKey, last_sequence: sequence } = rows[0];

  if (sequence > MAX_DAILY_SEQUENCE) {
    const error = new Error(`Daily order number sequence exhausted for ${dateKey} (max ${MAX_DAILY_SEQUENCE} per day).`);
    // Stable marker so the API layer can turn this into a meaningful
    // response instead of a generic 500 (see routes/orders.routes.js).
    error.code = ORDER_NUMBER_EXHAUSTED;
    throw error;
  }

  return `ORD-${dateKey}-${String(sequence).padStart(3, '0')}`;
}
