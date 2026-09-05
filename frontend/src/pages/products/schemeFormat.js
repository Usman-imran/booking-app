// Renders a bonus scheme the way PROJECT_SPEC.md describes it everywhere
// ("20 + 2", "30 + 1", ...): Purchase Qty + Bonus Qty.
export function formatScheme(product) {
  if (!product.schemeEnabled) return 'No scheme';
  return `${product.schemePurchaseQty} + ${product.schemeBonusQty}`;
}
