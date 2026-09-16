import pool from '../config/db.js';
import { getAchievedSales, getAchievedSalesByCompany } from './report.js';

// Monthly targets (PROJECT_SPEC.md §19), with the approved company-wise
// extension.
//
// A target's scope is either the month OVERALL (`company` NULL) or one
// manufacturer within it. There are still no booker targets and no area
// targets (§19, §20).
//
// Achieved figures are never computed here — they come from report.js, the
// single definition of a valid sale, so a target and a sales report can
// never disagree about the same month (§34).
//
// Targets belong to one user (owner_id), like everything else: each account
// sets its own targets and they are measured against that account's own
// sales. Every function takes the owner explicitly.

const SELECT_FIELDS = 'id, year, month, company, target_amount, created_at, updated_at';

// Money arrives from PostgreSQL as a string and is summed as a float here,
// so a subtraction can leave dust (10000 - 9999.99 = 0.009999999999). Every
// derived figure is rounded to the paisa it is displayed at.
function round2(value) {
  return Math.round(value * 100) / 100;
}

// The Targets arithmetic of PROJECT_SPEC.md §19, in one place so the
// Targets page and the Dashboard cannot compute it differently:
//
//   Achieved      = valid sales for the month (and company, if scoped)
//   Remaining     = Target - Achieved
//   Achievement % = (Achieved / Target) x 100
//
// §19 explicitly requires zero-target handling. A zero (or absent) target
// makes the percentage undefined, not infinite: it is reported as `null`
// rather than NaN or Infinity, and callers render that as "—". Remaining is
// returned raw, so an exceeded target shows as a negative number the UI can
// present as "exceeded by".
export function computeProgress({ targetAmount, achieved }) {
  const target = round2(Number(targetAmount ?? 0));
  const achievedAmount = round2(Number(achieved ?? 0));

  let status;
  if (target <= 0) {
    status = 'no-target';
  } else if (achievedAmount >= target) {
    status = 'achieved';
  } else if (achievedAmount <= 0) {
    status = 'not-started';
  } else {
    status = 'in-progress';
  }

  return {
    targetAmount: target,
    achieved: achievedAmount,
    remaining: round2(target - achievedAmount),
    achievementPercent: target > 0 ? round2((achievedAmount / target) * 100) : null,
    status,
  };
}

export async function findTargetById(ownerId, id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM monthly_targets WHERE owner_id = $1 AND id = $2`, [
    ownerId,
    id,
  ]);
  return rows[0] || null;
}

// Looks a target up by its scope rather than its id. `company` omitted (or
// null) means the month's overall target. Matched case-insensitively, the
// same way the unique index is built, so 'GSK' and 'gsk' are one target.
export async function findTargetByScope({ ownerId, year, month, company }) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM monthly_targets
     WHERE owner_id = $1 AND year = $2 AND month = $3 AND lower(coalesce(company, '')) = lower(coalesce($4, ''))`,
    [ownerId, year, month, company ?? null]
  );
  return rows[0] || null;
}

export async function listTargetsForMonth({ ownerId, year, month }) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM monthly_targets
     WHERE owner_id = $1 AND year = $2 AND month = $3
     ORDER BY company NULLS FIRST`,
    [ownerId, year, month]
  );
  return rows;
}

export async function createTarget({ ownerId, year, month, company, targetAmount }) {
  const { rows } = await pool.query(
    `INSERT INTO monthly_targets (owner_id, year, month, company, target_amount)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_FIELDS}`,
    [ownerId, year, month, company ?? null, targetAmount]
  );
  return rows[0];
}

// Sets the target for a scope, creating it if it isn't there yet. This is
// what "set the target for October" means in practice — the caller knows
// the month and the company, not a row id.
//
// The conflict target is the unique index's expression, so an upsert lands
// on the same row whether the company was typed 'GSK' or 'gsk'.
export async function upsertTarget({ ownerId, year, month, company, targetAmount }) {
  const { rows } = await pool.query(
    `INSERT INTO monthly_targets (owner_id, year, month, company, target_amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id, year, month, (lower(coalesce(company, ''))))
     DO UPDATE SET target_amount = EXCLUDED.target_amount
     RETURNING ${SELECT_FIELDS}`,
    [ownerId, year, month, company ?? null, targetAmount]
  );
  return rows[0];
}

export async function updateTargetAmount(ownerId, id, targetAmount) {
  const { rows } = await pool.query(
    `UPDATE monthly_targets SET target_amount = $1 WHERE owner_id = $2 AND id = $3 RETURNING ${SELECT_FIELDS}`,
    [targetAmount, ownerId, id]
  );
  return rows[0] || null;
}

export async function deleteTarget(ownerId, id) {
  const { rows } = await pool.query(
    `DELETE FROM monthly_targets WHERE owner_id = $1 AND id = $2 RETURNING ${SELECT_FIELDS}`,
    [ownerId, id]
  );
  return rows[0] || null;
}

// A month's full picture: the overall target and every company target, each
// paired with what was actually achieved.
//
// Two queries in total regardless of how many targets exist — the month's
// sales are fetched once, grouped by company, and matched up in memory
// rather than queried per target (PROJECT_SPEC.md §35: no N+1).
//
// `includeCompanies` also surfaces manufacturers that sold this month but
// have no target yet, flagged `no-target`. Those rows are the whole reason
// someone opens this page: they show where a target is missing.
export async function getMonthProgress({ ownerId, year, month, includeCompanies = true }) {
  const targets = await listTargetsForMonth({ ownerId, year, month });

  const overallTarget = targets.find((row) => row.company === null) ?? null;
  const overallSales = await getAchievedSales({ ownerId, year, month });

  const overall = {
    id: overallTarget?.id ?? null,
    scope: 'overall',
    company: null,
    orders: overallSales.orders,
    ...computeProgress({ targetAmount: overallTarget?.target_amount ?? 0, achieved: overallSales.achieved }),
  };

  if (!includeCompanies) {
    return { year, month, overall, companies: [] };
  }

  const salesByCompany = await getAchievedSalesByCompany({ ownerId, year, month });
  const salesByKey = new Map(salesByCompany.map((row) => [row.company.toLowerCase(), row]));

  const companies = targets
    .filter((row) => row.company !== null)
    .map((row) => {
      const sales = salesByKey.get(row.company.toLowerCase());
      return {
        id: row.id,
        scope: 'company',
        company: row.company,
        orders: sales?.orders ?? 0,
        ...computeProgress({ targetAmount: row.target_amount, achieved: sales?.achieved ?? 0 }),
      };
    });

  const targetedKeys = new Set(companies.map((row) => row.company.toLowerCase()));
  const untargeted = salesByCompany
    .filter((row) => !targetedKeys.has(row.company.toLowerCase()))
    .map((row) => ({
      id: null,
      scope: 'company',
      company: row.company,
      orders: row.orders,
      ...computeProgress({ targetAmount: 0, achieved: row.achieved }),
    }));

  return {
    year,
    month,
    overall,
    // Targets first (biggest first), then the companies still without one.
    companies: [...companies.sort((a, b) => b.targetAmount - a.targetAmount), ...untargeted],
  };
}

export function toPublicTarget(target) {
  return {
    id: target.id,
    year: target.year,
    month: target.month,
    company: target.company,
    scope: target.company === null ? 'overall' : 'company',
    targetAmount: Number(target.target_amount),
    createdAt: target.created_at,
    updatedAt: target.updated_at,
  };
}
