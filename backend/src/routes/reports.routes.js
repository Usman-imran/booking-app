import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  getCompanySales,
  getCustomerSales,
  getDailySales,
  getMonthlySales,
  getProductSales,
  getSalesSummary,
} from '../models/report.js';

const router = Router();

router.use(authenticate);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The reports PROJECT_SPEC.md §18 requires, plus company-wise — the
// product report rolled up by manufacturer, which is how a distributor's
// suppliers actually ask for the numbers. "Date-range Sales" isn't a
// different grouping — it's the totals for a chosen period — so it maps to
// the summary that every report already returns, with no rows of its own.
//
// There is no booker-wise report: every account is its own isolated
// workspace, so every order in a report already belongs to the one user
// reading it and the grouping would always be a single row.
const REPORTS = {
  daily: getDailySales,
  monthly: getMonthlySales,
  customer: getCustomerSales,
  product: getProductSales,
  company: getCompanySales,
  range: null,
};

const REPORT_TYPES = Object.keys(REPORTS);

function isValidDateString(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// GET /api/reports?type=daily&dateFrom=&dateTo=&page=&limit=
//
// Every report is computed by models/report.js, which holds the one
// definition of a valid sale (PROJECT_SPEC.md §34): submitted orders only,
// bonus quantities worth nothing, discounts already applied. No screen gets
// its own formula.
//
// `summary` is returned alongside every report — for `type=range` it IS the
// report, and elsewhere it gives the period's totals so a paginated table
// still shows a true grand total rather than the total of one page.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type === undefined ? 'daily' : req.query.type;

    if (typeof type !== 'string' || !REPORT_TYPES.includes(type)) {
      throw new ApiError(400, `type must be one of: ${REPORT_TYPES.join(', ')}.`);
    }

    const { dateFrom, dateTo } = req.query;
    for (const [field, value] of [
      ['dateFrom', dateFrom],
      ['dateTo', dateTo],
    ]) {
      if (value !== undefined && (typeof value !== 'string' || !isValidDateString(value))) {
        throw new ApiError(400, `${field} must be a valid date in YYYY-MM-DD format.`);
      }
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ApiError(400, 'dateFrom must not be after dateTo.');
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    // Scoped to the caller's own orders before any other filter applies.
    const filters = { ownerId: req.user.id, dateFrom, dateTo };

    // The summary covers the whole period regardless of paging, so the two
    // are fetched together rather than derived from the visible rows.
    const summary = await getSalesSummary(filters);

    if (type === 'range') {
      return res.json({
        type,
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
        summary,
        rows: [],
        pagination: { page: 1, limit, total: 0, totalPages: 1 },
      });
    }

    const { rows, total } = await REPORTS[type]({ ...filters, page, limit });

    res.json({
      type,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      summary,
      rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  })
);

export default router;
