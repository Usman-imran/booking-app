import pool from '../config/db.js';

// The freemium plan, in one place: who is Pro, what Free is allowed, and
// how today's usage is counted. Every limit is enforced here on the server;
// the app's own checks only exist to explain the limit before a request
// fails.

// New orders a Free account may create per day (drafts included - a draft
// is a created order; submitting it later doesn't count again).
export const FREE_DAILY_ORDER_LIMIT = 20;

// "Today" for the daily limit: midnight in the business's timezone, not
// the database's (a hosted database runs on UTC, where the day would turn
// over at 5am in Pakistan).
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Karachi';

// Pro while the paid-up date lies in the future. `user` is a users row.
export function isPro(user) {
  return Boolean(user?.pro_until) && new Date(user.pro_until).getTime() > Date.now();
}

export function planOf(user) {
  return isPro(user) ? 'pro' : 'free';
}

// New orders this account created since midnight (APP_TIMEZONE), and when
// that count next resets.
export async function getDailyOrderUsage(ownerId) {
  const { rows } = await pool.query(
    `WITH day AS (
       SELECT (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2) AS starts_at
     )
     SELECT COUNT(o.id)::int AS count,
            (SELECT starts_at + interval '1 day' FROM day) AS resets_at
       FROM orders o
      WHERE o.booker_id = $1
        AND o.created_at >= (SELECT starts_at FROM day)`,
    [ownerId, APP_TIMEZONE]
  );
  return { ordersToday: rows[0].count, resetsAt: rows[0].resets_at };
}

// The plan summary the app shows and gates on.
export async function getPlanSummary(user) {
  const { ordersToday, resetsAt } = await getDailyOrderUsage(user.id);
  const pro = isPro(user);
  return {
    plan: pro ? 'pro' : 'free',
    proUntil: user.pro_until ?? null,
    // null = unlimited.
    dailyOrderLimit: pro ? null : FREE_DAILY_ORDER_LIMIT,
    ordersToday,
    resetsAt,
  };
}
