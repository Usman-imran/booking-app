import pool from '../config/db.js';

// Sales reporting (PROJECT_SPEC.md §18).
//
// This file is the SINGLE definition of what counts as a sale. §34 requires
// the Dashboard, Sales Reports and Targets to agree exactly — "do not
// implement separate formulas for each screen" — so every figure any screen
// shows must come from here, and nothing outside this file should ever
// write its own SUM over orders.
//
// The rules, in one place:
//
//   * Only SUBMITTED orders count. Drafts aren't sales yet and cancelled
//     orders stop being sales the moment they're cancelled (§12, §18).
//     Status is exactly one of three values, so `status = 'submitted'`
//     excludes both.
//   * Bonus quantities have ZERO sales value. This needs no special-casing:
//     a line's stored `line_total` is derived from the PAID quantity only,
//     so bonus units can never reach a total. Bonus is reported as a
//     quantity, never as money.
//   * Discounts reduce the line's value: `line_total = line_subtotal -
//     line_discount`, and an order's total is the sum of its line totals.
//     Summing either column therefore already has discounts applied.
//   * Every amount is the value snapshotted at order time, so a later price
//     or discount change can never move a historical figure (§16).
//   * Every report is for ONE user's orders. Each account is its own
//     isolated workspace, so `ownerId` is the first thing every filter
//     applies and no figure here ever mixes two users' sales.

// A sale's date is when the order was SUBMITTED, not when its draft was
// first created — an order drafted in January and submitted in February is
// a February sale. This is also the date its ORD-YYYYMMDD-XXX number was
// issued against, so a report and an order number never disagree about
// which day a sale belongs to.
const SALE_DATE = 'o.submitted_at';
const VALID_SALE = "o.status = 'submitted'";

// Builds the WHERE clause shared by every report below. `dateFrom`/`dateTo`
// are inclusive calendar dates, compared in the database's own timezone —
// the same reference the daily order-number sequence resets on.
function buildFilter({ ownerId, dateFrom, dateTo }) {
  const params = [ownerId];
  const conditions = ['o.booker_id = $1', VALID_SALE];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${SALE_DATE}::date >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${SALE_DATE}::date <= $${params.length}::date`);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

function toMoney(value) {
  return Number(value ?? 0);
}

// Overall totals for the selected period — the "Date-range Sales" report
// (§18), and the same number Targets compares a monthly target against and
// the Dashboard shows as today's/this month's sales.
export async function getSalesSummary({ ownerId, dateFrom, dateTo }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS orders,
       COALESCE(SUM(o.total), 0) AS sales,
       COALESCE(SUM(o.subtotal), 0) AS subtotal,
       COALESCE(SUM(o.discount_total), 0) AS discount_total
     FROM orders o
     ${where}`,
    params
  );

  // Quantities come from the lines, so they need their own pass.
  const { rows: qtyRows } = await pool.query(
    `SELECT
       COALESCE(SUM(oi.paid_qty), 0)::int AS paid_qty,
       COALESCE(SUM(oi.bonus_qty), 0)::int AS bonus_qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     ${where}`,
    params
  );

  return {
    orders: rows[0].orders,
    sales: toMoney(rows[0].sales),
    subtotal: toMoney(rows[0].subtotal),
    discountTotal: toMoney(rows[0].discount_total),
    paidQty: qtyRows[0].paid_qty,
    bonusQty: qtyRows[0].bonus_qty,
  };
}

// The database's own idea of today. The Dashboard shows "today's" and
// "this month's" figures, and those have to mean the same day as the sale
// dates above and the daily ORD-YYYYMMDD-XXX sequence — all of which are
// decided by the database's timezone, not the Node process's. Asking the
// database removes the chance of the two disagreeing at a day boundary.
export async function getCurrentPeriod() {
  const { rows } = await pool.query(
    `SELECT CURRENT_DATE::text AS date,
            EXTRACT(YEAR FROM CURRENT_DATE)::int AS year,
            EXTRACT(MONTH FROM CURRENT_DATE)::int AS month`
  );
  return rows[0];
}

// The calendar bounds of a month, as the inclusive YYYY-MM-DD dates the
// filter above already understands — so a monthly target measures exactly
// the same period, by exactly the same rules, as a monthly sales report.
function monthBounds(year, month) {
  const pad = (value) => String(value).padStart(2, '0');
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// Achieved sales for one month, for Targets (PROJECT_SPEC.md §19) and the
// Dashboard (§3). Both must use the Sales Reports rules exactly (§34), so
// this is deliberately built on the same VALID_SALE condition and the same
// sale date as every report above — there is no second formula.
//
// `company` narrows it to one manufacturer's products: an approved
// extension to §19's overall monthly target. Omit it for the whole month.
//
// Aggregated over the LINES rather than the orders, so the overall and
// company-wise figures come from one code path. That is exact, not an
// approximation: an order's total is the sum of its line totals, enforced
// by a database check constraint. Bonus quantities can't reach the figure —
// `line_total` is priced on the paid quantity alone — and line discounts
// are already deducted from it.
//
// A company target is attributed using each product's CURRENT manufacturer.
// Products don't snapshot their company (it isn't a commercial value under
// §16), so correcting a product's manufacturer moves its past sales to the
// corrected company — which is the intended reading of "this company's
// sales", not a loss of history: the money on each line is untouched.
export async function getAchievedSales({ ownerId, year, month, company }) {
  const { dateFrom, dateTo } = monthBounds(year, month);
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const conditions = [where];
  const queryParams = [...params];

  if (company) {
    queryParams.push(company);
    // Manufacturer names are typed by hand in two unrelated places (the
    // product and the target), so they are matched case-insensitively.
    conditions.push(`lower(p.company) = lower($${queryParams.length})`);
  }

  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(oi.line_total), 0) AS achieved,
       COUNT(DISTINCT o.id)::int AS orders
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     ${conditions.join(' AND ')}`,
    queryParams
  );

  return { achieved: toMoney(rows[0].achieved), orders: rows[0].orders };
}

// Every manufacturer's achieved sales for a month, in ONE query.
//
// Targets are listed per company, and looking each one up separately would
// be exactly the N+1 §35 warns against. Keyed by lower-cased company name
// to match how targets are stored and compared.
export async function getAchievedSalesByCompany({ ownerId, year, month }) {
  const { dateFrom, dateTo } = monthBounds(year, month);
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows } = await pool.query(
    `SELECT
       p.company AS company,
       COALESCE(SUM(oi.line_total), 0) AS achieved,
       COUNT(DISTINCT o.id)::int AS orders
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     ${where} AND p.company IS NOT NULL
     GROUP BY p.company
     ORDER BY COALESCE(SUM(oi.line_total), 0) DESC`,
    params
  );

  return rows.map((row) => ({
    company: row.company,
    achieved: toMoney(row.achieved),
    orders: row.orders,
  }));
}

// Shared paging tail. Reports are grouped aggregates, so the row count is
// the number of GROUPS, not orders — hence the wrapping COUNT.
async function runGrouped({ select, from, groupBy, orderBy, where, params, page, limit }) {
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM (SELECT 1 FROM ${from} ${where} GROUP BY ${groupBy}) g`,
    params
  );

  const { rows } = await pool.query(
    `SELECT ${select}
     FROM ${from}
     ${where}
     GROUP BY ${groupBy}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );

  return { rows, total: countResult.rows[0].total };
}

// Daily Sales (§18): date, number of valid orders, sales amount.
export async function getDailySales({ ownerId, dateFrom, dateTo, page, limit }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows, total } = await runGrouped({
    select: `${SALE_DATE}::date::text AS period,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o.total), 0) AS sales`,
    from: 'orders o',
    groupBy: `${SALE_DATE}::date`,
    orderBy: `${SALE_DATE}::date DESC`,
    where,
    params,
    page,
    limit,
  });

  return {
    rows: rows.map((row) => ({ period: row.period, orders: row.orders, sales: toMoney(row.sales) })),
    total,
  };
}

// Monthly Sales (§18): month, number of valid orders, sales amount.
export async function getMonthlySales({ ownerId, dateFrom, dateTo, page, limit }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows, total } = await runGrouped({
    select: `to_char(date_trunc('month', ${SALE_DATE}), 'YYYY-MM') AS period,
             EXTRACT(YEAR FROM ${SALE_DATE})::int AS year,
             EXTRACT(MONTH FROM ${SALE_DATE})::int AS month,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o.total), 0) AS sales`,
    from: 'orders o',
    groupBy: `date_trunc('month', ${SALE_DATE}), EXTRACT(YEAR FROM ${SALE_DATE}), EXTRACT(MONTH FROM ${SALE_DATE})`,
    orderBy: `date_trunc('month', ${SALE_DATE}) DESC`,
    where,
    params,
    page,
    limit,
  });

  return {
    rows: rows.map((row) => ({
      period: row.period,
      year: row.year,
      month: row.month,
      orders: row.orders,
      sales: toMoney(row.sales),
    })),
    total,
  };
}

// Customer-wise Sales (§18): customer, orders, sales.
export async function getCustomerSales({ ownerId, dateFrom, dateTo, page, limit }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows, total } = await runGrouped({
    select: `c.id AS customer_id, c.name AS customer_name, c.code AS customer_code,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o.total), 0) AS sales`,
    from: 'orders o JOIN customers c ON c.id = o.customer_id',
    groupBy: 'c.id, c.name, c.code',
    // Biggest customers first — the ordering a sales report is read in.
    orderBy: 'COALESCE(SUM(o.total), 0) DESC, c.name ASC',
    where,
    params,
    page,
    limit,
  });

  return {
    rows: rows.map((row) => ({
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerCode: row.customer_code,
      orders: row.orders,
      sales: toMoney(row.sales),
    })),
    total,
  };
}

// Product-wise Sales (§18): product, paid quantity sold, bonus quantity,
// sales.
//
// This one aggregates the LINES rather than the orders. Bonus quantity is
// summed and shown, but it contributes nothing to `sales` — that comes from
// line_total, which is priced on the paid quantity alone.
//
// Grouped by product id and labelled with the product's CURRENT name and
// code, so a renamed product stays one row instead of splitting into one
// per historical name. The money is still every line's own snapshot.
export async function getProductSales({ ownerId, dateFrom, dateTo, page, limit }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const { rows, total } = await runGrouped({
    select: `p.id AS product_id, p.name AS product_name, p.code AS product_code,
             COALESCE(SUM(oi.paid_qty), 0)::int AS paid_qty,
             COALESCE(SUM(oi.bonus_qty), 0)::int AS bonus_qty,
             COUNT(DISTINCT o.id)::int AS orders,
             COALESCE(SUM(oi.line_total), 0) AS sales`,
    from: 'order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id',
    groupBy: 'p.id, p.name, p.code',
    orderBy: 'COALESCE(SUM(oi.line_total), 0) DESC, p.name ASC',
    where,
    params,
    page,
    limit,
  });

  return {
    rows: rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      productCode: row.product_code,
      paidQty: row.paid_qty,
      bonusQty: row.bonus_qty,
      orders: row.orders,
      sales: toMoney(row.sales),
    })),
    total,
  };
}

// Company-wise Sales: manufacturer, distinct products sold, paid and bonus
// quantities, orders, sales.
//
// The product-wise report rolled up one level: the same lines, the same
// money, grouped by each product's CURRENT manufacturer — the reading
// getAchievedSales() already uses for company targets, so a company's
// figure here and its target progress can never disagree. Products with no
// manufacturer recorded form one row of their own (company null) rather
// than vanishing from the total.
//
// Manufacturer names are typed by hand, so they are grouped
// case-insensitively and blanks are treated as missing; the row is
// labelled with the most common spelling.
export async function getCompanySales({ ownerId, dateFrom, dateTo, page, limit }) {
  const { where, params } = buildFilter({ ownerId, dateFrom, dateTo });

  const companyKey = "lower(NULLIF(btrim(p.company), ''))";

  const { rows, total } = await runGrouped({
    select: `${companyKey} AS company_key,
             mode() WITHIN GROUP (ORDER BY NULLIF(btrim(p.company), '')) AS company,
             COUNT(DISTINCT p.id)::int AS products,
             COALESCE(SUM(oi.paid_qty), 0)::int AS paid_qty,
             COALESCE(SUM(oi.bonus_qty), 0)::int AS bonus_qty,
             COUNT(DISTINCT o.id)::int AS orders,
             COALESCE(SUM(oi.line_total), 0) AS sales`,
    from: 'order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id',
    groupBy: companyKey,
    orderBy: `COALESCE(SUM(oi.line_total), 0) DESC, ${companyKey} ASC NULLS LAST`,
    where,
    params,
    page,
    limit,
  });

  return {
    rows: rows.map((row) => ({
      company: row.company ?? null,
      products: row.products,
      paidQty: row.paid_qty,
      bonusQty: row.bonus_qty,
      orders: row.orders,
      sales: toMoney(row.sales),
    })),
    total,
  };
}
