import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { RECEIPT_COLORS as C, type Receipt, type ReceiptLine } from '@/lib/receipt/receiptData';
import { formatMoney } from '@/lib/theme';

// The on-screen preview of the receipt: the HTML template's colours, sizes
// and spacing (receiptHtml.ts's STYLES) as native views, laid out at the
// fixed 760px the JPG uses. The JPG and PDF themselves are rendered from
// the HTML template, not from this view - this exists so the booker sees
// the invoice before choosing how to send it, so it mirrors the template's
// compact 25-lines-per-page sizing.
export const RECEIPT_WIDTH = 760;

// Column widths: the template's 9 / 41 / 7 / 8 / 9 / 11 / 15 % (S.NO,
// product, qty, bonus, discount, rate, line total), so the preview's
// columns sit where the exported invoice's do. The S.NO column includes
// the page gutter, as in the template. Everything numeric is
// right-aligned, the way money reads.
const COLUMNS = {
  serial: Math.round(RECEIPT_WIDTH * 0.09),
  name: Math.round(RECEIPT_WIDTH * 0.41),
  paidQty: Math.round(RECEIPT_WIDTH * 0.07),
  bonus: Math.round(RECEIPT_WIDTH * 0.08),
  discount: Math.round(RECEIPT_WIDTH * 0.09),
  rate: Math.round(RECEIPT_WIDTH * 0.11),
  lineTotal: Math.round(RECEIPT_WIDTH * 0.15),
} as const;

type Align = 'left' | 'right' | 'center';

function Cell({
  width,
  align = 'left',
  first,
  last,
  children,
}: {
  width: number;
  align?: Align;
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.cell,
        { width },
        align === 'right' && styles.cellRight,
        align === 'center' && styles.cellCenter,
        first && styles.cellFirst,
        last && styles.cellLast,
      ]}>
      {children}
    </View>
  );
}

function HeaderCell({
  width,
  align,
  first,
  last,
  label,
}: {
  width: number;
  align?: Align;
  first?: boolean;
  last?: boolean;
  label: string;
}) {
  return (
    <Cell width={width} align={align} first={first} last={last}>
      <Text style={styles.th}>{label}</Text>
    </Cell>
  );
}

function LineRow({ line, index }: { line: ReceiptLine; index: number }) {
  return (
    <View style={[styles.tr, index % 2 === 1 && styles.trZebra]}>
      <Cell width={COLUMNS.serial} align="center" first>
        <Text style={[styles.num, styles.serial]}>{line.serial}</Text>
      </Cell>
      <Cell width={COLUMNS.name}>
        {/* Name and code on one line, so a row stays one line tall unless
            the name itself wraps - the same rule as the template. */}
        <Text style={styles.product}>
          {line.name}
          {line.code ? <Text style={styles.code}>{`  ${line.code}`}</Text> : null}
        </Text>
      </Cell>
      <Cell width={COLUMNS.paidQty} align="right">
        <Text style={styles.num}>{line.paidQty}</Text>
      </Cell>
      <Cell width={COLUMNS.bonus} align="right">
        {/* Bonus is free stock, so it is a coloured chip rather than
            another number that looks paid for. */}
        {line.bonusQty > 0 ? (
          <Text style={styles.bonus}>+{line.bonusQty}</Text>
        ) : (
          <Text style={[styles.num, styles.dash]}>—</Text>
        )}
      </Cell>
      <Cell width={COLUMNS.discount} align="right">
        <Text style={[styles.num, line.discount <= 0 && styles.dash]}>
          {line.discount > 0 ? `${formatMoney(line.discount)}%` : '—'}
        </Text>
      </Cell>
      <Cell width={COLUMNS.rate} align="right">
        <Text style={styles.num}>{formatMoney(line.rate)}</Text>
      </Cell>
      <Cell width={COLUMNS.lineTotal} align="right" last>
        <Text style={[styles.num, styles.lineTotal]}>{formatMoney(line.lineTotal)}</Text>
      </Cell>
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

// The receipt at its full design width; ReceiptPreview scales it to fit.
export function ReceiptView({
  receipt,
  onLayout,
}: {
  receipt: Receipt;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const isCancelled = receipt.status === 'cancelled';
  const { customer, totals } = receipt;

  return (
    <View onLayout={onLayout} style={styles.receipt}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={styles.brand}>{receipt.brandName}</Text>
          {receipt.brandTagline ? <Text style={styles.tagline}>{receipt.brandTagline}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.number}>{receipt.orderNumber || 'DRAFT'}</Text>
          {/* Date and status share a line to keep the header short. */}
          <View style={styles.dateRow}>
            <Text style={styles.date}>{receipt.dateLabel}</Text>
            <Text style={[styles.status, isCancelled ? styles.statusCancelled : styles.statusSubmitted]}>
              {receipt.statusLabel.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.parties}>
        <View style={styles.party}>
          <Text style={styles.partyLabel}>BILL TO</Text>
          <Text style={styles.partyName}>
            {customer.name}
            {customer.code ? <Text style={styles.partyCode}>{`  ${customer.code}`}</Text> : null}
          </Text>
          {customer.address ? <Text style={styles.partyLine}>{customer.address}</Text> : null}
          {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
        </View>
        <View style={styles.party}>
          <Text style={styles.partyLabel}>BOOKED BY</Text>
          <Text style={styles.partyName}>{receipt.bookerName}</Text>
        </View>
      </View>

      <View style={styles.thead}>
        <HeaderCell width={COLUMNS.serial} label="S.NO" align="center" first />
        <HeaderCell width={COLUMNS.name} label="Product Name" />
        <HeaderCell width={COLUMNS.paidQty} label="Qty" align="right" />
        <HeaderCell width={COLUMNS.bonus} label="Bonus" align="right" />
        <HeaderCell width={COLUMNS.discount} label="Disc %" align="right" />
        <HeaderCell width={COLUMNS.rate} label="Rate" align="right" />
        <HeaderCell width={COLUMNS.lineTotal} label="Line Total" align="right" last />
      </View>
      {receipt.lines.map((line, index) => (
        <LineRow key={line.id} line={line} index={index} />
      ))}

      <View style={styles.footer}>
        <View style={styles.remarks}>
          {receipt.remarks ? (
            <>
              <Text style={styles.partyLabel}>REMARKS</Text>
              <Text style={styles.remarksText}>{receipt.remarks}</Text>
            </>
          ) : null}
          {totals.bonusQty > 0 ? (
            <Text style={styles.note}>Bonus quantity is supplied free and carries no charge.</Text>
          ) : null}
          {isCancelled ? (
            <Text style={styles.cancelledNote}>This order has been cancelled and is not payable.</Text>
          ) : null}
        </View>

        <View style={styles.totals}>
          <TotalRow label="Total Paid Items" value={String(totals.paidQty)} />
          <TotalRow label="Total Bonus Items" value={totals.bonusQty > 0 ? `+${totals.bonusQty} free` : '0'} />
          <TotalRow label="Subtotal" value={formatMoney(totals.subtotal)} />
          <TotalRow
            label="Total Savings"
            value={totals.discountTotal > 0 ? `- ${formatMoney(totals.discountTotal)}` : formatMoney(0)}
          />
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <Text style={styles.grandTotalValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Fits the fixed-width receipt into whatever width the screen offers by
// scaling it down, the way a PDF viewer fits a page.
export function ReceiptPreview({ receipt }: { receipt: Receipt }) {
  const [frameWidth, setFrameWidth] = useState(0);
  const [receiptHeight, setReceiptHeight] = useState(0);

  const scale = frameWidth > 0 ? Math.min(1, frameWidth / RECEIPT_WIDTH) : 0;

  return (
    <View
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
      // Until both measurements are in, the frame has no height and the
      // receipt is invisible rather than briefly rendered at full size.
      style={[
        styles.frame,
        {
          height: receiptHeight * scale,
          opacity: scale > 0 && receiptHeight > 0 ? 1 : 0,
        },
      ]}
    >
      <View style={[styles.scaler, { transform: [{ scale }] }]}>
        <ReceiptView receipt={receipt} onLayout={(event) => setReceiptHeight(event.nativeEvent.layout.height)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  frame: { width: '100%', overflow: 'hidden' },
  scaler: { width: RECEIPT_WIDTH, transformOrigin: 'top left' },

  receipt: { width: RECEIPT_WIDTH, backgroundColor: C.white },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: C.navy,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  tagline: { fontSize: 10.5, color: C.headerMuted, marginTop: 2, lineHeight: 13 },
  headerRight: { alignItems: 'flex-end' },
  number: { fontSize: 14, fontWeight: '700', color: C.white, lineHeight: 17 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 },
  date: { fontSize: 10.5, color: C.headerMuted, lineHeight: 13 },
  status: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.white,
  },
  statusSubmitted: { backgroundColor: C.submitted },
  statusCancelled: { backgroundColor: C.cancelled },

  parties: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 22,
    paddingBottom: 6,
  },
  party: { width: '50%', paddingRight: 16 },
  partyLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.muted,
    marginBottom: 2,
    lineHeight: 10,
  },
  partyName: { fontSize: 12.5, fontWeight: '700', color: C.navy, lineHeight: 15 },
  partyCode: { fontSize: 9.5, fontWeight: '400', color: C.muted },
  partyLine: { fontSize: 10, color: C.muted, lineHeight: 12 },

  thead: {
    flexDirection: 'row',
    backgroundColor: C.navyAccent,
  },
  th: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, color: C.white, lineHeight: 11 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  trZebra: { backgroundColor: C.zebra },
  cell: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    justifyContent: 'flex-start',
  },
  cellRight: { alignItems: 'flex-end' },
  cellCenter: { alignItems: 'center' },
  // The outer columns carry the page gutter, as in the template.
  cellFirst: { paddingLeft: 22 },
  cellLast: { paddingRight: 22 },
  serial: { color: C.muted },
  product: { fontSize: 10.5, fontWeight: '600', color: C.navy, lineHeight: 13 },
  code: { fontSize: 9, fontWeight: '400', color: C.muted },
  num: {
    fontSize: 10.5,
    color: C.charcoal,
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
  dash: { color: C.muted },
  lineTotal: { fontWeight: '700', color: C.navy },
  bonus: {
    paddingHorizontal: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: C.bonusFill,
    color: C.bonusText,
    fontWeight: '700',
    fontSize: 9.5,
    lineHeight: 13,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 14,
  },
  remarks: { width: '55%', paddingRight: 20 },
  remarksText: { fontSize: 10.5, color: C.charcoal, lineHeight: 13 },
  note: { marginTop: 6, fontSize: 9.5, color: C.muted, lineHeight: 12 },
  cancelledNote: {
    marginTop: 6,
    fontSize: 10.5,
    fontWeight: '700',
    color: C.cancelled,
    lineHeight: 13,
  },
  totals: { width: '45%', maxWidth: 260 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
  },
  totalLabel: { fontSize: 10.5, color: C.muted, lineHeight: 13 },
  totalValue: {
    fontSize: 10.5,
    fontWeight: '700',
    color: C.charcoal,
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: C.navy,
  },
  grandTotalLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.white,
  },
  grandTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
    fontVariant: ['tabular-nums'],
  },
});
