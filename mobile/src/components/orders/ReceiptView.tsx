import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { RECEIPT_COLORS as C, type Receipt, type ReceiptLine } from '@/lib/receipt/receiptData';
import { formatMoney } from '@/lib/theme';

// The on-screen preview of the receipt: the HTML template's colours, sizes
// and spacing (index.css's `.receipt-*` rules) as native views, laid out at
// the web's fixed 760px. The JPG and PDF themselves are rendered from the
// HTML template (receiptHtml.ts), not from this view - this exists so the
// booker sees the invoice before choosing how to send it.
export const RECEIPT_WIDTH = 760;

// Column widths: the template's 35 / 12 / 12 / 10 / 11 / 20 % of the content
// width between the 28pt gutters, so the preview's columns sit where the
// exported invoice's do. Everything except the product name is
// right-aligned, the way money reads.
const CONTENT_WIDTH = RECEIPT_WIDTH - 2 * 16;
const COLUMNS = {
  name: Math.round(CONTENT_WIDTH * 0.35),
  rate: Math.round(CONTENT_WIDTH * 0.12),
  paidQty: Math.round(CONTENT_WIDTH * 0.12),
  bonus: Math.round(CONTENT_WIDTH * 0.1),
  discount: Math.round(CONTENT_WIDTH * 0.11),
  lineTotal: Math.round(CONTENT_WIDTH * 0.2),
} as const;

function Cell({ width, right, children }: { width: number; right?: boolean; children: React.ReactNode }) {
  return <View style={[styles.cell, { width }, right && styles.cellRight]}>{children}</View>;
}

function HeaderCell({ width, right, label }: { width: number; right?: boolean; label: string }) {
  return (
    <Cell width={width} right={right}>
      <Text style={styles.th}>{label}</Text>
    </Cell>
  );
}

function LineRow({ line, index }: { line: ReceiptLine; index: number }) {
  return (
    <View style={[styles.tr, index % 2 === 1 && styles.trZebra]}>
      <Cell width={COLUMNS.name}>
        <Text style={styles.product}>{line.name}</Text>
        {line.code ? <Text style={styles.code}>{line.code}</Text> : null}
      </Cell>
      <Cell width={COLUMNS.rate} right>
        <Text style={styles.num}>{formatMoney(line.rate)}</Text>
      </Cell>
      <Cell width={COLUMNS.paidQty} right>
        <Text style={styles.num}>{line.paidQty}</Text>
      </Cell>
      <Cell width={COLUMNS.bonus} right>
        {/* Bonus is free stock, so it is a coloured chip rather than
            another number that looks paid for. */}
        {line.bonusQty > 0 ? (
          <Text style={styles.bonus}>+{line.bonusQty}</Text>
        ) : (
          <Text style={[styles.num, styles.dash]}>—</Text>
        )}
      </Cell>
      <Cell width={COLUMNS.discount} right>
        <Text style={[styles.num, line.discount <= 0 && styles.dash]}>
          {line.discount > 0 ? `${formatMoney(line.discount)}%` : '—'}
        </Text>
      </Cell>
      <Cell width={COLUMNS.lineTotal} right>
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
          <Text style={styles.date}>{receipt.dateLabel}</Text>
          <Text style={[styles.status, isCancelled ? styles.statusCancelled : styles.statusSubmitted]}>
            {receipt.statusLabel.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.parties}>
        <View style={styles.party}>
          <Text style={styles.partyLabel}>BILL TO</Text>
          <Text style={styles.partyName}>{customer.name}</Text>
          {customer.code ? <Text style={styles.partyLine}>{customer.code}</Text> : null}
          {customer.address ? <Text style={styles.partyLine}>{customer.address}</Text> : null}
          {customer.phone ? <Text style={styles.partyLine}>{customer.phone}</Text> : null}
        </View>
        <View style={styles.party}>
          <Text style={styles.partyLabel}>BOOKED BY</Text>
          <Text style={styles.partyName}>{receipt.bookerName}</Text>
        </View>
      </View>

      <View style={styles.thead}>
        <HeaderCell width={COLUMNS.name} label="Product" />
        <HeaderCell width={COLUMNS.rate} label="Rate" right />
        <HeaderCell width={COLUMNS.paidQty} label="Paid Qty" right />
        <HeaderCell width={COLUMNS.bonus} label="Bonus" right />
        <HeaderCell width={COLUMNS.discount} label="Disc %" right />
        <HeaderCell width={COLUMNS.lineTotal} label="Line Total" right />
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
    paddingVertical: 22,
    paddingHorizontal: 28,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.2,
  },
  tagline: { fontSize: 12, color: C.headerMuted, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  number: { fontSize: 17, fontWeight: '700', color: C.white },
  date: { fontSize: 12, color: C.headerMuted, marginTop: 2 },
  status: {
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.white,
  },
  statusSubmitted: { backgroundColor: C.submitted },
  statusCancelled: { backgroundColor: C.cancelled },

  parties: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  party: { width: '50%', paddingRight: 20 },
  partyLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted,
    marginBottom: 4,
  },
  partyName: { fontSize: 15, fontWeight: '700', color: C.navy, lineHeight: 22 },
  partyLine: { fontSize: 12, color: C.muted, lineHeight: 17 },

  thead: {
    flexDirection: 'row',
    backgroundColor: C.navyAccent,
    paddingHorizontal: 16,
  },
  th: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: C.white },
  tr: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  trZebra: { backgroundColor: C.zebra },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
  },
  cellRight: { alignItems: 'flex-end' },
  product: { fontSize: 13, fontWeight: '600', color: C.navy, lineHeight: 19 },
  code: { fontSize: 11, color: C.muted, lineHeight: 16 },
  num: {
    fontSize: 13,
    color: C.charcoal,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  dash: { color: C.muted },
  lineTotal: { fontWeight: '700', color: C.navy },
  bonus: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: C.bonusFill,
    color: C.bonusText,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 26,
  },
  remarks: { width: '55%', paddingRight: 24 },
  remarksText: { fontSize: 12, color: C.charcoal, lineHeight: 17 },
  note: { marginTop: 10, fontSize: 11, color: C.muted, lineHeight: 16 },
  cancelledNote: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: C.cancelled,
    lineHeight: 17,
  },
  totals: { width: '45%', maxWidth: 300 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 12, color: C.muted },
  totalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: C.charcoal,
    fontVariant: ['tabular-nums'],
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: C.navy,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.white,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
    fontVariant: ['tabular-nums'],
  },
});
