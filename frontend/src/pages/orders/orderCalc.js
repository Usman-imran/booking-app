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

// A tier only counts if both quantities are usable — the server never
// stores one that isn't, so this is a guard, not the validation.
function isUsableTier(tier) {
  return (
    Number.isInteger(tier.purchaseQty) && tier.purchaseQty > 0 && Number.isInteger(tier.bonusQty) && tier.bonusQty >= 0
  );
}

// The tier that serves a paid quantity: the highest purchase quantity the
// order reaches, or null when none does. With 10+1 and 50+6, qty 49 is
// served by 10+1 and qty 50 by 50+6. Mirrors the backend's bonusSchemes.js.
export function applicableScheme(product, paidQty) {
  if (!Number.isInteger(paidQty) || paidQty <= 0) return null;
  const tiers = [...(product.bonusSchemes ?? [])].filter(isUsableTier).sort((a, b) => a.purchaseQty - b.purchaseQty);
  let match = null;
  for (const tier of tiers) {
    if (tier.purchaseQty <= paidQty) match = tier;
  }
  return match;
}

// PROJECT_SPEC.md §9: Bonus Quantity = floor(Q / P) x B, for the tier that
// applies to Q. A "20 + 2" scheme gives 2 at qty 20, 4 at qty 40, 2 at qty
// 25, 0 at qty 19. Bonus units are free — they never carry sales value.
export function calculateBonusQty(product, paidQty) {
  const tier = applicableScheme(product, paidQty);
  if (!tier) return 0;
  return Math.floor(paidQty / tier.purchaseQty) * tier.bonusQty;
}

// One order line at the product's current price and discount. `paidQty` of
// 0 (an empty or not-yet-valid quantity box) yields a zeroed line rather
// than NaN, so the summary stays readable while the booker is typing.
export function calculateLine(product, paidQty, { discount } = {}) {
  const qty = Number.isInteger(paidQty) && paidQty > 0 ? paidQty : 0;

  const rateCents = toCents(product.salePrice);
  const lineSubtotalCents = rateCents * qty;

  // Discount is a per-line percentage with 2 decimals (PROJECT_SPEC.md §7).
  // The product's own discount is the default; the booker can override it
  // for this line, and whichever value applies is what the server stores.
  // Signature mirrors the backend's buildOrderLine exactly, so the two stay
  // directly comparable.
  const effectiveDiscount =
    discount === undefined || discount === null ? Number(product.discount) : Number(discount);
  const discountHundredths = Math.round(effectiveDiscount * CENTS);
  const lineDiscountCents = Math.round((lineSubtotalCents * discountHundredths) / (100 * CENTS));

  return {
    paidQty: qty,
    bonusQty: calculateBonusQty(product, qty),
    rate: Number(product.salePrice),
    discount: effectiveDiscount,
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
