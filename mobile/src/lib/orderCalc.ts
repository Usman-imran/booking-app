import type { Product } from './api/products';

// Live order-line maths for the Create Order screen - a direct port of the
// web frontend's orderCalc.js, which itself mirrors the backend's
// orderPricing.js rule for rule. The booker has to see the line total and
// bonus quantity update as they type; the server never trusts these numbers
// and recomputes every one of them at save time.
//
// Money is computed in integer paisa and converted back only at the end, so
// the preview rounds exactly the way the stored order will.

const CENTS = 100;

function toCents(value: number) {
  return Math.round(Number(value) * CENTS);
}

function fromCents(cents: number) {
  return cents / CENTS;
}

type SchemeFields = Pick<Product, 'schemeEnabled' | 'schemePurchaseQty' | 'schemeBonusQty'>;
type PricedProduct = SchemeFields & Pick<Product, 'salePrice' | 'discount'>;

// A scheme only counts if it's enabled and both quantities are usable.
function schemeApplies(product: SchemeFields): product is SchemeFields & {
  schemePurchaseQty: number;
  schemeBonusQty: number;
} {
  return (
    Boolean(product.schemeEnabled) &&
    Number.isInteger(product.schemePurchaseQty) &&
    (product.schemePurchaseQty as number) > 0 &&
    Number.isInteger(product.schemeBonusQty) &&
    (product.schemeBonusQty as number) >= 0
  );
}

// Bonus Quantity = floor(Q / P) x B. A "20 + 2" scheme gives 2 at qty 20,
// 4 at qty 40, 2 at qty 25, 0 at qty 19. Bonus units are free.
export function calculateBonusQty(product: SchemeFields, paidQty: number) {
  if (!schemeApplies(product) || !Number.isInteger(paidQty) || paidQty <= 0) {
    return 0;
  }
  return Math.floor(paidQty / product.schemePurchaseQty) * product.schemeBonusQty;
}

export type LineCalc = {
  paidQty: number;
  bonusQty: number;
  rate: number;
  discount: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
};

// One order line at the product's current price. `paidQty` of 0 (an empty
// or not-yet-valid quantity box) yields a zeroed line rather than NaN, so
// the summary stays readable while the booker is typing.
export function calculateLine(
  product: PricedProduct,
  paidQty: number,
  { discount }: { discount?: number | null } = {}
): LineCalc {
  const qty = Number.isInteger(paidQty) && paidQty > 0 ? paidQty : 0;

  const rateCents = toCents(product.salePrice);
  const lineSubtotalCents = rateCents * qty;

  // Discount is a per-line percentage with 2 decimals. The product's own
  // discount is the default; the booker can override it for this line.
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

export type OrderTotals = {
  totalItems: number;
  totalPaidQty: number;
  totalBonusQty: number;
  subtotal: number;
  discountTotal: number;
  total: number;
};

// `totalItems` counts distinct products; paid and bonus quantities are kept
// apart because only the paid quantity carries any value.
export function calculateTotals(lines: LineCalc[]): OrderTotals {
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

// "20 + 2" - the way a scheme is written everywhere in the app.
export function formatScheme(product: SchemeFields) {
  if (!product.schemeEnabled) return 'No scheme';
  return `${product.schemePurchaseQty} + ${product.schemeBonusQty}`;
}
