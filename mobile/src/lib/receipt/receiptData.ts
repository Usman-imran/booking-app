import type { OrderDetail } from '@/lib/api/orders';

// One derivation of everything a receipt shows - a direct port of the
// former web frontend's receiptData.js, so the mobile invoice prints the
// same figures the web one did.
//
// The receipt is rendered twice on mobile as well - as a native view (for
// the on-screen preview and the JPG) and as HTML (for the PDF) - so the
// numbers are computed once, here, and both renderers consume the result.

// Used when a booker has no company name recorded - accounts created before
// the field existed, mainly. A receipt still has to have a heading, and a
// neutral description beats an empty banner or a product name.
export const FALLBACK_BRAND_NAME = 'Medicine Distribution';
export const BRAND_TAGLINE = 'Medicine Distribution';

// The palette the receipt is drawn in, identical to the web's so a receipt
// shared from the phone matches one shared from the browser.
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
  headerMuted: '#CBD5E1',
  submitted: '#16A34A',
  cancelled: '#DC2626',
} as const;

export type ReceiptLine = {
  id: string;
  name: string;
  code: string;
  rate: number;
  paidQty: number;
  bonusQty: number;
  discount: number;
  scheme: string | null;
  lineTotal: number;
};

export type Receipt = {
  brandName: string;
  brandTagline: string;
  orderNumber: string;
  status: OrderDetail['status'];
  statusLabel: string;
  dateLabel: string;
  customer: { name: string; code: string; phone: string; address: string };
  bookerName: string;
  remarks: string;
  lines: ReceiptLine[];
  totals: {
    items: number;
    paidQty: number;
    bonusQty: number;
    subtotal: number;
    discountTotal: number;
    total: number;
  };
};

function formatDateTime(value: string | null | undefined) {
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
// the product - a receipt for a six-month-old order must show the prices
// that order was actually placed at (PROJECT_SPEC.md §16).
export function buildReceipt(
  order: OrderDetail,
  { companyName, bookerName }: { companyName?: string | null; bookerName?: string | null } = {}
): Receipt {
  const lines: ReceiptLine[] = order.items.map((item) => ({
    id: item.id,
    name: item.productName,
    code: item.productCode,
    rate: item.rate,
    paidQty: item.paidQty,
    bonusQty: item.bonusQty,
    discount: item.discount,
    scheme: item.schemePurchaseQty !== null ? `${item.schemePurchaseQty} + ${item.schemeBonusQty}` : null,
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
    // The signed-in user is the fallback for the rare payload without a
    // booker joined on - the booker is always the one sharing.
    bookerName: order.booker?.name ?? (String(bookerName ?? '').trim() || '—'),
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

export function receiptFileName(receipt: Receipt, extension: 'jpg' | 'pdf') {
  return `${receipt.orderNumber || 'order'}-receipt.${extension}`;
}
