import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';
import { showInterstitialIfDue } from '@/lib/admobInterstitial';
import { StatusBadge } from '@/components/StatusBadge';
import { cancelOrder, deleteDraftOrder, getOrder, submitDraftOrder, type OrderDetail } from '@/lib/api/orders';
import { cardShadow, colors, formatDateTime, formatMoney, radius, spacing } from '@/lib/theme';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

// One order in full - lines, totals, customer - with the actions its status
// allows: a draft can be continued, submitted or deleted; a submitted order
// can be shared as an invoice or cancelled; a cancelled one is read-only.
// Mirrors the web's OrderDetails page.
//
// `shareOnOpen` opens the invoice as soon as the order loads - the landing
// for a draft submitted from the Create Order screen, so it ends the same
// way as a new order: with the receipt ready to send.
export function OrderDetailsScreen({ id, shareOnOpen = false }: { id: string; shareOnOpen?: boolean }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [action, setAction] = useState<null | 'submit' | 'cancel' | 'delete'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getOrder(id);
      setOrder(data.order);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Only once, on the first successful load: reopening the sheet every
  // pull-to-refresh would be maddening.
  const autoShared = useRef(false);
  useEffect(() => {
    if (!shareOnOpen || autoShared.current || order?.status !== 'submitted') return;
    autoShared.current = true;
    setIsReceiptOpen(true);
  }, [shareOnOpen, order]);

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  async function run(kind: 'submit' | 'cancel' | 'delete') {
    setAction(kind);
    setActionError(null);
    setNotice(null);
    try {
      if (kind === 'submit') {
        const data = await submitDraftOrder(id);
        setOrder(data.order);
        setNotice(`Order ${data.order.orderNumber} submitted.`);
      } else if (kind === 'cancel') {
        const data = await cancelOrder(id);
        setOrder(data.order);
        setNotice('Order cancelled.');
      } else {
        await deleteDraftOrder(id);
        router.back();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAction(null);
    }
  }

  function confirm(kind: 'submit' | 'cancel' | 'delete') {
    const copy = {
      submit: {
        title: 'Submit this draft?',
        message: 'It will get an order number and become permanent. A submitted order cannot be edited, only cancelled.',
        button: 'Submit Order',
      },
      cancel: {
        title: 'Cancel this order?',
        message: 'The order is kept for the record but marked cancelled. This cannot be undone.',
        button: 'Cancel Order',
      },
      delete: {
        title: 'Delete this draft?',
        message: 'The draft and everything on it will be removed. This cannot be undone.',
        button: 'Delete Draft',
      },
    }[kind];

    Alert.alert(copy.title, copy.message, [
      { text: 'Keep', style: 'cancel' },
      { text: copy.button, style: kind === 'submit' ? 'default' : 'destructive', onPress: () => run(kind) },
    ]);
  }

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error' || !order) {
    return <ErrorState message={`Could not load this order: ${error}`} onRetry={load} />;
  }

  const totalPaidQty = order.items.reduce((sum, item) => sum + item.paidQty, 0);
  const totalBonusQty = order.items.reduce((sum, item) => sum + item.bonusQty, 0);
  const isBusy = action !== null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      {notice ? (
        <Banner kind="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Banner>
      ) : null}
      {actionError ? <Banner kind="error">{actionError}</Banner> : null}

      <View style={styles.card}>
        <View style={styles.headRow}>
          <View style={styles.flex1}>
            <Text style={styles.orderNumber}>{order.orderNumber || 'Draft'}</Text>
            <Text style={styles.meta}>
              {order.status === 'draft'
                ? `Saved ${formatDateTime(order.updatedAt)}`
                : `Submitted ${formatDateTime(order.submittedAt)}`}
              {order.cancelledAt ? ` · Cancelled ${formatDateTime(order.cancelledAt)}` : ''}
            </Text>
          </View>
          <StatusBadge status={order.status} />
        </View>
        {order.status === 'draft' ? (
          <Text style={styles.draftHint}>No order number yet - one is assigned when the draft is submitted.</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Customer</Text>
      <View style={styles.card}>
        <Text style={styles.customerName}>
          {order.customer?.name ?? '-'} <Text style={styles.meta}>({order.customer?.code})</Text>
        </Text>
        <Text style={styles.meta}>
          {[order.customer?.phone, order.customer?.cityArea, order.customer?.address].filter(Boolean).join(' · ') ||
            'No contact details on file'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Items <Text style={styles.count}>{order.items.length}</Text>
      </Text>
      {order.items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.meta}>This draft has no items yet.</Text>
        </View>
      ) : (
        order.items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.headRow}>
              <View style={styles.flex1}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.meta}>
                  {item.productCode} · {formatMoney(item.rate)} × {item.paidQty}
                  {item.bonusQty > 0 ? ` (+${item.bonusQty} free)` : ''}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{formatMoney(item.lineTotal)}</Text>
            </View>
            {item.discount > 0 ? (
              <Text style={styles.itemDiscount}>
                Discount {formatMoney(item.discount)}% · − {formatMoney(item.lineDiscount)}
              </Text>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.card}>
        <Row label="Items" value={String(order.items.length)} />
        <Row label="Paid Qty" value={String(totalPaidQty)} />
        <Row label="Bonus Qty" value={totalBonusQty > 0 ? `+${totalBonusQty}` : '0'} />
        <Row label="Subtotal" value={formatMoney(order.subtotal)} />
        <Row label="Discount" value={order.discountTotal > 0 ? `− ${formatMoney(order.discountTotal)}` : formatMoney(0)} />
        <View style={styles.grandTotal}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={[styles.grandTotalValue, order.status === 'cancelled' && styles.void]}>
            {formatMoney(order.total)}
          </Text>
        </View>
        {order.remarks ? (
          <View style={styles.remarks}>
            <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.textMuted} />
            <Text style={styles.remarksText}>{order.remarks}</Text>
          </View>
        ) : null}
      </View>

      {order.status === 'draft' ? (
        <View style={styles.actions}>
          <Button
            title="Continue Draft"
            icon="create-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/orders/new', params: { draftId: order.id } })}
            disabled={isBusy}
          />
          <Button
            title="Submit Order"
            icon="checkmark-circle-outline"
            onPress={() => confirm('submit')}
            loading={action === 'submit'}
            disabled={isBusy || order.items.length === 0}
          />
          <Button
            title="Delete Draft"
            icon="trash-outline"
            variant="danger"
            onPress={() => confirm('delete')}
            loading={action === 'delete'}
            disabled={isBusy}
          />
        </View>
      ) : order.status === 'submitted' ? (
        <View style={styles.actions}>
          <Button
            title="Share / Export Invoice"
            icon="share-social-outline"
            onPress={() => setIsReceiptOpen(true)}
            disabled={isBusy}
          />
          <Button
            title="Cancel Order"
            icon="close-circle-outline"
            variant="danger"
            onPress={() => confirm('cancel')}
            loading={action === 'cancel'}
            disabled={isBusy}
          />
          <Text style={styles.note}>Submitted orders are permanent and cannot be edited - only cancelled.</Text>
        </View>
      ) : (
        <Text style={styles.note}>This order was cancelled and is kept for the record only.</Text>
      )}

      <OrderReceiptModal
        visible={isReceiptOpen}
        order={order}
        onClose={() => {
          setIsReceiptOpen(false);
          // Only fires for a just-submitted draft that was a 5th/10th/...
          // order; reopening any other receipt shows nothing.
          showInterstitialIfDue(order?.id);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  orderNumber: { fontSize: 20, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  draftHint: { fontSize: 12, color: colors.warning, marginTop: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  count: { color: colors.primary, fontSize: 14 },
  customerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemDiscount: { fontSize: 12, color: colors.warning, marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowValueStrong: { fontSize: 16 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  grandTotalValue: { fontSize: 22, fontWeight: '700', color: colors.primary },
  void: { color: colors.textMuted, textDecorationLine: 'line-through' },
  remarks: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start' },
  remarksText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  actions: { gap: spacing.md, marginTop: spacing.md },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, textAlign: 'center', marginTop: spacing.sm },
});
