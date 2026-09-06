import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  createTarget,
  deleteTarget,
  findTargetById,
  findTargetByScope,
  getMonthProgress,
  toPublicTarget,
  updateTargetAmount,
  upsertTarget,
} from '../models/target.js';

const router = Router();

router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMPANY_MAX = 150;
// Matches the database check constraint, so an out-of-range value is a
// clear 400 rather than a constraint violation surfacing as a 500.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
// numeric(14,2) ceiling, same as an order's total.
const MAX_TARGET = 999999999999.99;

function parsePeriod(source, { required }) {
  const errors = [];
  const now = new Date();

  let year;
  let month;

  if (source.year === undefined || source.year === '') {
    if (required) errors.push('year is required.');
    else year = now.getFullYear();
  } else {
    year = Number(source.year);
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      errors.push(`year must be a whole number between ${MIN_YEAR} and ${MAX_YEAR}.`);
    }
  }

  if (source.month === undefined || source.month === '') {
    if (required) errors.push('month is required.');
    else month = now.getMonth() + 1;
  } else {
    month = Number(source.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push('month must be a whole number between 1 and 12.');
    }
  }

  return { year, month, errors };
}

// A target is either the month's overall target or one manufacturer's.
// `company` absent, null or blank all mean overall — so an empty form field
// can't quietly create a target for a company named "".
function parseCompany(value) {
  if (value === undefined || value === null) return { company: null, errors: [] };
  if (typeof value !== 'string') return { company: null, errors: ['company must be a string.'] };

  const trimmed = value.trim();
  if (trimmed === '') return { company: null, errors: [] };
  if (trimmed.length > COMPANY_MAX) {
    return { company: null, errors: [`company must be at most ${COMPANY_MAX} characters.`] };
  }
  return { company: trimmed, errors: [] };
}

function parseTargetAmount(value) {
  if (value === undefined || value === null || value === '') {
    return { targetAmount: null, errors: ['targetAmount is required.'] };
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return { targetAmount: null, errors: ['targetAmount must be a number.'] };
  if (amount < 0) return { targetAmount: null, errors: ['targetAmount must not be negative.'] };
  if (amount > MAX_TARGET) return { targetAmount: null, errors: ['targetAmount is too large.'] };
  // Money is stored to the paisa; round rather than let the column truncate.
  return { targetAmount: Math.round(amount * 100) / 100, errors: [] };
}

function parseTargetBody(body) {
  const period = parsePeriod(body, { required: true });
  const company = parseCompany(body.company);
  const amount = parseTargetAmount(body.targetAmount);

  const errors = [...period.errors, ...company.errors, ...amount.errors];
  return {
    data: { year: period.year, month: period.month, company: company.company, targetAmount: amount.targetAmount },
    errors,
  };
}

// GET /api/targets?year=&month=&scope=all|overall
//
// A month's targets alongside what was actually achieved (PROJECT_SPEC.md
// §19). Achieved comes from models/report.js — the same definition of a
// valid sale that Sales Reports use (§34) — so this page and the reports
// can never disagree about the same month.
//
// `scope=overall` returns just the month's overall target; the default
// (`all`) also returns every company target, plus any manufacturer that
// sold this month without a target set, so missing targets are visible
// rather than invisible.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { year, month, errors } = parsePeriod(req.query, { required: false });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    const scope = req.query.scope === undefined ? 'all' : req.query.scope;
    if (!['all', 'overall'].includes(scope)) {
      throw new ApiError(400, 'scope must be one of: all, overall.');
    }

    const progress = await getMonthProgress({ year, month, includeCompanies: scope === 'all' });
    res.json({ ...progress, scope });
  })
);

// POST /api/targets — create a target for a month/company that has none.
// Body: { year, month, company?, targetAmount }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { data, errors } = parseTargetBody(req.body ?? {});
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    const existing = await findTargetByScope(data);
    if (existing) {
      throw new ApiError(
        409,
        data.company
          ? `A target for ${existing.company} already exists for ${data.month}/${data.year}. Update it instead.`
          : `An overall target already exists for ${data.month}/${data.year}. Update it instead.`
      );
    }

    let target;
    try {
      target = await createTarget(data);
    } catch (err) {
      // Lost a race with a concurrent create against the unique index.
      if (err.code === '23505') {
        throw new ApiError(409, 'A target already exists for that month and company.');
      }
      throw err;
    }

    res.status(201).json({ target: toPublicTarget(target) });
  })
);

// PUT /api/targets — set the target for a month/company, creating it if it
// doesn't exist yet. Body: { year, month, company?, targetAmount }
//
// Addressed by scope rather than by id because that is what the caller
// actually knows: "the October target for GSK". It also makes the form
// idempotent — saving twice sets the same value instead of failing the
// second time.
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { data, errors } = parseTargetBody(req.body ?? {});
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    const target = await upsertTarget(data);
    res.json({ target: toPublicTarget(target) });
  })
);

// PUT /api/targets/:id — change an existing target's amount, leaving its
// month and scope alone. Moving a target to a different month or company
// would silently change which sales it is measured against, so that is not
// an edit: delete it and set the one you meant.
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      throw new ApiError(400, 'Invalid target id.');
    }

    const { targetAmount, errors } = parseTargetAmount(req.body?.targetAmount);
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    const existing = await findTargetById(req.params.id);
    if (!existing) {
      throw new ApiError(404, 'Target not found.');
    }

    const target = await updateTargetAmount(req.params.id, targetAmount);
    res.json({ target: toPublicTarget(target) });
  })
);

// DELETE /api/targets/:id — remove a target entirely. Targets hold no
// history of their own (the orders they measure are untouched), so unlike
// an order this is a real delete. Setting an amount to 0 would otherwise be
// the only way to undo a target created by mistake.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      throw new ApiError(400, 'Invalid target id.');
    }

    const deleted = await deleteTarget(req.params.id);
    if (!deleted) {
      throw new ApiError(404, 'Target not found.');
    }

    res.json({ target: toPublicTarget(deleted) });
  })
);

export default router;
