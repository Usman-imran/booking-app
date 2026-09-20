// The bonus-scheme rules shared by product validation, order pricing and
// the bulk import (PROJECT_SPEC.md §8/§9).
//
// A product carries zero or more tiers, each `{ purchaseQty, bonusQty }`:
// "buy purchaseQty, get bonusQty free". Tiers are kept sorted by purchase
// quantity and no two share one, so "the tier for quantity Q" is always
// unambiguous: it is the highest tier whose purchase quantity Q reaches.

// A tier is usable when both quantities are whole numbers, the purchase
// quantity is at least 1 (a divisor), and the bonus is not negative.
export function isValidTier(tier) {
  return (
    tier !== null &&
    typeof tier === 'object' &&
    Number.isInteger(tier.purchaseQty) &&
    tier.purchaseQty > 0 &&
    Number.isInteger(tier.bonusQty) &&
    tier.bonusQty >= 0
  );
}

// Sorts tiers by purchase quantity and strips anything unusable. Data
// read back from the database has already been validated, so this is a
// belt-and-braces normalisation rather than the validation itself.
export function normaliseSchemes(schemes) {
  if (!Array.isArray(schemes)) return [];
  return schemes
    .filter(isValidTier)
    .map((tier) => ({ purchaseQty: tier.purchaseQty, bonusQty: tier.bonusQty }))
    .sort((a, b) => a.purchaseQty - b.purchaseQty);
}

// The tier that applies to a paid quantity: the one with the largest
// purchase quantity the order reaches, or null when none does (or the
// product has no scheme). With tiers 10+1 and 50+6, qty 49 is served by
// 10+1 and qty 50 by 50+6.
export function applicableScheme(schemes, paidQty) {
  if (!Number.isInteger(paidQty) || paidQty <= 0) return null;
  let match = null;
  for (const tier of normaliseSchemes(schemes)) {
    if (tier.purchaseQty <= paidQty) match = tier;
  }
  return match;
}

// PROJECT_SPEC.md §9: Bonus Quantity = floor(Q / P) x B, using the tier
// that applies to Q. A "20 + 2" scheme gives 2 at qty 20, 4 at qty 40, 2
// at qty 25, and 0 at qty 19.
export function calculateBonusQty(schemes, paidQty) {
  const tier = applicableScheme(schemes, paidQty);
  if (!tier) return 0;
  return Math.floor(paidQty / tier.purchaseQty) * tier.bonusQty;
}
