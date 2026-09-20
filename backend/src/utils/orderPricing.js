// Order line pricing, discount, and bonus calculation
// (PROJECT_SPEC.md §6, §7, §8, §9, §16).
//
// Everything here is pure: it takes a product snapshot plus an ordered
// quantity and returns the values that get frozen into an order item. No
// database access, no request handling — so the rules can be reasoned about
// (and reused by draft editing / re-order in later stages) in one place.
//
// All money is computed in integer cents and converted back to a decimal
// only at the end. That matters for two reasons:
//   1. Floating-point drift (the classic 0.1 + 0.2) can never reach a
//      stored money column.
//   2. The database enforces `line_total = line_subtotal - line_discount`
//      (and the same identity at order level) on values already rounded to
//      2 decimals by the numeric(_,2) columns. Doing the arithmetic on
//      rounded integers is what guarantees that identity still holds
//      exactly after the insert, instead of failing the check constraint by
//      a fraction of a paisa.

import { applicableScheme, calculateBonusQty as bonusForSchemes } from './bonusSchemes.js';

const CENTS = 100;

// Largest value a numeric(14,2) money column can hold. Order/line amounts
// are validated against this before an insert is attempted, so an absurd
// quantity produces a clean validation error rather than a database
// overflow (22003) surfacing as a 500.
export const MAX_AMOUNT = 999999999999.99;

function toCents(value) {
  return Math.round(Number(value) * CENTS);
}

function fromCents(cents) {
  return cents / CENTS;
}

// PROJECT_SPEC.md §9: Bonus Quantity = floor(Q / P) x B, where P and B are
// the purchase and bonus quantity of the tier that applies to Q — the
// highest of the product's tiers Q reaches (bonusSchemes.js). A "20 + 2"
// scheme gives 2 at qty 20, 4 at qty 40, 2 at qty 25, and 0 at qty 19.
//
// Bonus quantity is never part of the paid quantity and carries zero sales
// value — it only ever affects the physical quantity shipped.
//
// Product validation guarantees every stored tier is sane, but an order
// must never be the thing that discovers a half-configured one: it would
// either divide by zero or write a snapshot that violates the order_items
// "both-or-neither" check constraint. The helpers ignore any such tier.
export function calculateBonusQty(product, paidQty) {
  return bonusForSchemes(product.bonusSchemes, paidQty);
}

// Builds one order line from the product's CURRENT values. Everything the
// line needs is copied out of the product here and now — name, code, MRP,
// rate, discount, and the applicable scheme — because a later change to the
// product must never alter this order (PROJECT_SPEC.md §6, §16).
//
// `product` is a normalized product (the shape returned by
// `toPublicProduct`), not a raw database row.
export function buildOrderLine(product, paidQty, { discount } = {}) {
  // The rate charged is the product's Sale Price; MRP is snapshotted
  // alongside it for reference but is not what the line is priced on. The
  // rate is never overridable — a client naming its own unit price would
  // make every sales figure meaningless.
  const rateCents = toCents(product.salePrice);
  const lineSubtotalCents = rateCents * paidQty;

  // Discount is a per-product percentage (PROJECT_SPEC.md §7). The product's
  // own discount is the default, but a booker can adjust it for one line of
  // one order — discounting a particular sale is ordinary trade, and §7 only
  // requires that whatever was used is snapshotted onto the order item.
  // Whatever is agreed here is what gets stored and what reports read.
  const effectiveDiscount = discount === undefined || discount === null ? Number(product.discount) : Number(discount);

  // Stored with 2 decimals, so scale to hundredths of a percent to keep the
  // whole calculation in integers: subtotal x pct/100, rounded to the
  // nearest cent.
  const discountHundredths = Math.round(effectiveDiscount * CENTS);
  const lineDiscountCents = Math.round((lineSubtotalCents * discountHundredths) / (100 * CENTS));
  const lineTotalCents = lineSubtotalCents - lineDiscountCents;

  // The one tier that served this quantity is what gets frozen onto the
  // line, so the receipt can show "20 + 2" next to the bonus it produced.
  const tier = applicableScheme(product.bonusSchemes, paidQty);

  return {
    productId: product.id,
    productName: product.name,
    productCode: product.code,
    mrp: Number(product.mrp),
    rate: fromCents(rateCents),
    discount: effectiveDiscount,
    paidQty,
    bonusQty: calculateBonusQty(product, paidQty),
    schemePurchaseQty: tier ? tier.purchaseQty : null,
    schemeBonusQty: tier ? tier.bonusQty : null,
    lineSubtotal: fromCents(lineSubtotalCents),
    lineDiscount: fromCents(lineDiscountCents),
    lineTotal: fromCents(lineTotalCents),
  };
}

// Order totals are the sum of the line totals (PROJECT_SPEC.md §7) — there
// is no order-level discount. Summed in cents so the stored
// `total = subtotal - discount_total` identity is exact.
export function sumOrderTotals(lines) {
  let subtotalCents = 0;
  let discountCents = 0;

  for (const line of lines) {
    subtotalCents += toCents(line.lineSubtotal);
    discountCents += toCents(line.lineDiscount);
  }

  return {
    subtotal: fromCents(subtotalCents),
    discountTotal: fromCents(discountCents),
    total: fromCents(subtotalCents - discountCents),
  };
}
