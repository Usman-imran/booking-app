// Renders bonus schemes the way PROJECT_SPEC.md describes them everywhere
// ("20 + 2", "30 + 1", ...): Purchase Qty + Bonus Qty.

// One tier.
export function formatTier(tier) {
  return `${tier.purchaseQty} + ${tier.bonusQty}`;
}

// Every tier of a product on one line ("10 + 1, 50 + 6"), or "No scheme".
export function formatScheme(product) {
  const tiers = product.bonusSchemes ?? [];
  if (tiers.length === 0) return 'No scheme';
  return tiers.map(formatTier).join(', ');
}
