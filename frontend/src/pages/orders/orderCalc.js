// Live order-line maths for the Create Order screen
// (PROJECT_SPEC.md §7, §9).
//
// This deliberately mirrors the backend's `backend/src/utils/orderPricing.js`
// rule for rule. The duplication is the point: the booker has to see the
// line total and the bonus quantity update as they type, long before
// anything is saved. The server never trusts these numbers — it recomputes
// every one of them from the product's own current values at save time, and
// what it returns is what was actually stored. If the two ever disagree
// (because a price changed mid-order), the server's figures win.
//
// Money is computed in integer paisa and converted back only at the end, so
// the preview rounds exactly the way the stored order will.

const CENTS = 100;

function toCents(value) {
  return Math.round(Number(value) * CENTS);
}

function fromCents(cents) {
  return cents / CENTS;
}

// A scheme only counts if it's enabled and both quantities are usable.
function schemeApplies(product) {
  return (
    Boolean(product.schemeEnabled) &&
    Number.isInteger(product.schemePurchaseQty) &&
    product.schemePurchaseQty > 0 &&
    Number.isInteger(product.schemeBonusQty) &&
    product.schemeBonusQty >= 0
  );
}

// PROJECT_SPEC.md §9: Bonus Quantity = floor(Q / P) x B.
// A "20 + 2" scheme gives 2 at qty 20, 4 at qty 40, 2 at qty 25, 0 at qty 19.
// Bonus units are free — they never carry sales value.
export function calculateBonusQty(product, paidQty) {
  if (!schemeApplies(product) || !Number.isInteger(paidQty) || paidQty <= 0) {
    return 0;
  }
  return Math.floor(paidQty / product.schemePurchaseQty) * product.schemeBonusQty;
}

// One order line at the product's current price and discount. `paidQty` of
// 0 (an empty or not-yet-valid quantity box) yields a zeroed line rather
// than NaN, so the summary stays readable while the booker is typing.
export function calculateLine(product, paidQty) {
  const qty = Number.isInteger(paidQty) && paidQty > 0 ? paidQty : 0;

  const rateCents = toCents(product.salePrice);
  const lineSubtotalCents = rateCents * qty;

  // Discount is a per-line percentage with 2 decimals (PROJECT_SPEC.md §7),
  // scaled to hundredths of a percent to keep the arithmetic in integers.
  const discountHundredths = Math.round(Number(product.discount) * CENTS);
  const lineDiscountCents = Math.round((lineSubtotalCents * discountHundredths) / (100 * CENTS));

  return {
    paidQty: qty,
    bonusQty: calculateBonusQty(product, qty),
    rate: Number(product.salePrice),
    discount: Number(product.discount),
    lineSubtotal: fromCents(lineSubtotalCents),
    lineDiscount: fromCents(lineDiscountCents),
    lineTotal: fromCents(lineSubtotalCents - lineDiscountCents),
  };
}

// Order Summary figures (PROJECT_SPEC.md §10, step 10). `totalItems` counts
// distinct products; paid and bonus quantities are kept apart because they
// mean different things — the booker ships paid + bonus, but only the paid
// quantity carries any value (PROJECT_SPEC.md §9).
export function calculateTotals(lines) {
  let subtotalCents = 0;
  let discountCents = 0;
  let paidQty = 0;
  let bonusQty = 0;

  for (const line of lines) {
    subtotalCents += toCents(line.lineSubtotal);
    discountCents += toCents(line.lineDiscount);
    paidQty += line.paidQty;
    bonusQty += line.bonusQty;
  }

  return {
    totalItems: lines.length,
    totalPaidQty: paidQty,
    totalBonusQty: bonusQty,
    subtotal: fromCents(subtotalCents),
    discountTotal: fromCents(discountCents),
    total: fromCents(subtotalCents - discountCents),
  };
}

export function formatMoney(value) {
  return Number(value).toFixed(2);
}
