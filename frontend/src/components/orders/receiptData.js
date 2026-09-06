// One derivation of everything a receipt shows.
//
// The receipt is rendered twice — as HTML (for the on-screen preview and
// the JPG) and as vector drawing commands (for the PDF) — so the numbers
// are computed once, here, and both renderers consume the result. Two
// layouts is a deliberate trade-off; two sets of arithmetic would be a bug
// waiting to happen.

// Used when a booker has no company name recorded — accounts created before
// the field existed, mainly. A receipt still has to have a heading, and a
// neutral description beats an empty banner or a product name.
export const FALLBACK_BRAND_NAME = 'Medicine Distribution';
export const BRAND_TAGLINE = 'Medicine Distribution';

// The palette the receipt is drawn in, shared by the HTML and the PDF so
// they match. Hex only: html2canvas cannot parse modern colour functions,
// and jsPDF wants plain RGB.
export const RECEIPT_COLORS = {
  navy: '#0F172A',
  navyAccent: '#1E3A8A',
  charcoal: '#1F2937',
  muted: '#6B7280',
  hairline: '#E5E7EB',
  zebra: '#F8FAFC',
  bonusText: '#166534',
  bonusFill: '#DCFCE7',
  white: '#FFFFFF',
};

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Flattens an order into exactly the rows and figures a receipt prints.
//
// Every amount is the snapshot stored on the order, never recomputed from
// the product — a receipt for a six-month-old order must show the prices
// that order was actually placed at (PROJECT_SPEC.md §16).
export function buildReceipt(order, { companyName } = {}) {
  const lines = order.items.map((item) => ({
    id: item.id,
    name: item.productName,
    code: item.productCode,
    rate: item.rate,
    paidQty: item.paidQty,
    bonusQty: item.bonusQty,
    discount: item.discount,
    scheme:
      item.schemePurchaseQty !== null ? `${item.schemePurchaseQty} + ${item.schemeBonusQty}` : null,
    lineTotal: item.lineTotal,
  }));

  // The heading is the distribution business the booker works for. A
  // blank-but-present name is treated as missing, so a whitespace value
  // can't produce an empty banner.
  const brandName = String(companyName ?? '').trim() || FALLBACK_BRAND_NAME;

  return {
    brandName,
    // The strapline is dropped when it would just repeat the heading.
    brandTagline: brandName === BRAND_TAGLINE ? '' : BRAND_TAGLINE,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: order.status === 'submitted' ? 'Submitted' : order.status === 'cancelled' ? 'Cancelled' : 'Draft',
    dateLabel: formatDateTime(order.submittedAt ?? order.createdAt),
    customer: {
      name: order.customer?.name ?? '—',
      code: order.customer?.code ?? '',
      phone: order.customer?.phone ?? '',
      // Address and area are separate fields; joined here so the receipt
      // shows one readable address line.
      address: [order.customer?.address, order.customer?.cityArea].filter(Boolean).join(', '),
    },
    bookerName: order.booker?.name ?? '—',
    remarks: order.remarks ?? '',
    lines,
    totals: {
      // "Items" is distinct products; the quantities are the units.
      items: lines.length,
      paidQty: lines.reduce((sum, line) => sum + line.paidQty, 0),
      bonusQty: lines.reduce((sum, line) => sum + line.bonusQty, 0),
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,
    },
  };
}

export function receiptFileName(receipt, extension) {
  return `${receipt.orderNumber || 'order'}-receipt.${extension}`;
}
