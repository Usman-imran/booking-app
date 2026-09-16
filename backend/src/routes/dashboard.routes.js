import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import authenticate from '../middleware/authenticate.js';
import { getCurrentPeriod, getSalesSummary } from '../models/report.js';
import { getMonthProgress } from '../models/target.js';
import { countOrdersByStatus, listOrders, toPublicOrder } from '../models/order.js';

const router = Router();

router.use(authenticate);

const RECENT_ORDER_LIMIT = 8;

// GET /api/dashboard — the operational overview of PROJECT_SPEC.md §3.
//
// This endpoint computes NOTHING of its own. Every figure is assembled from
// the modules that already own it:
//
//   * today's and this month's sales  -> models/report.js
//   * target / achieved / remaining / % -> models/target.js
//   * draft count and recent orders   -> models/order.js
//
// That is the point. §34 requires the Dashboard, Sales Reports and Targets
// to agree exactly and forbids a separate formula per screen, so the
// Dashboard deliberately has no sales arithmetic to get wrong: drafts and
// cancelled orders are excluded, bonus quantities are worth nothing and
// line discounts are already deducted, because that is what those modules
// do — not because this file repeats the rules.
//
// "Today" and "this month" come from the database's own clock, the same
// reference the sale dates and the daily order-number sequence use, so the
// Dashboard can't disagree with a report about which day it is.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = await getCurrentPeriod();
    // Every figure is the signed-in user's own.
    const ownerId = req.user.id;

    const [today, monthProgress, draftOrders, recent] = await Promise.all([
      getSalesSummary({ ownerId, dateFrom: period.date, dateTo: period.date }),
      // Carries the month's sales AND its target in one pass — the same
      // numbers the Targets page shows for this month.
      getMonthProgress({ ownerId, year: period.year, month: period.month, includeCompanies: false }),
      countOrdersByStatus(ownerId, ['draft']),
      // Drafts are excluded: they aren't orders yet, and they have their own
      // count above and their own page.
      listOrders(ownerId, { statuses: ['submitted', 'cancelled'], page: 1, limit: RECENT_ORDER_LIMIT }),
    ]);

    res.json({
      date: period.date,
      year: period.year,
      month: period.month,
      today: {
        orders: today.orders,
        sales: today.sales,
      },
      monthly: {
        orders: monthProgress.overall.orders,
        sales: monthProgress.overall.achieved,
      },
      target: {
        id: monthProgress.overall.id,
        targetAmount: monthProgress.overall.targetAmount,
        achieved: monthProgress.overall.achieved,
        remaining: monthProgress.overall.remaining,
        achievementPercent: monthProgress.overall.achievementPercent,
        status: monthProgress.overall.status,
      },
      draftOrders,
      recentOrders: recent.rows.map(toPublicOrder),
    });
  })
);

export default router;
