import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { OrderCard } from '@/components/orders/OrderCard';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';
import { ActionSheet, type SheetAction } from '@/components/ui/ActionSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SearchField } from '@/components/ui/SearchField';
import { SegmentedControl, type Segment } from '@/components/ui/SegmentedControl';
import { listOrders, type OrderStatus, type OrderSummary } from '@/lib/api/orders';
import { readOrdersPage, saveOrdersPage, withOfflineFallback } from '@/lib/offline/offlineCache';
import { usePendingOrders, type PendingOrder } from '@/lib/offline/offlineQueue';
import { pendingRow, showPendingOrder } from '@/lib/offline/pendingOrderView';
import { onOrderSynced } from '@/lib/syncService';
import { colors, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

// 'offline' is the device's own queue - orders not yet on the server.
type Filter = OrderStatus | 'all' | 'offline';

const EMPTY_PAGE = { orders: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

const EMPTY_COPY: Record<Filter, { title: string; message: string }> = {
  all: { title: 'No orders yet', message: 'Orders you book will appear here.' },
  draft: { title: 'No drafts', message: 'Orders saved as drafts wait here until you submit them.' },
  submitted: { title: 'No submitted orders', message: 'Submitted orders and their invoices appear here.' },
  cancelled: { title: 'No cancelled orders', message: 'Cancelled orders are kept here for the record.' },
  offline: { title: 'Everything is synced', message: 'Orders saved without a connection wait here until they sync.' },
};

function isPending(item: OrderSummary | PendingOrder): item is PendingOrder {
  return 'clientRef' in item;
}

export default function Orders() {
  const [filter, setFilter] = useState<Filter>('all');
  // The order whose ⋯ menu is open, and the one whose receipt is showing.
  const [menuOrder, setMenuOrder] = useState<OrderSummary | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      // The Offline segment is the local queue alone; nothing to fetch.
      if (filter === 'offline') return { items: [] as OrderSummary[], pagination: EMPTY_PAGE.pagination };
      const status = filter === 'all' ? undefined : filter;
      // Offline, page 1 comes from the copy saved the last time it was
      // viewed (or is empty, so queued orders still show); later pages
      // aren't saved, so scrolling further just stops.
      const { data: result } = await withOfflineFallback(
        async () => {
          const data = await listOrders({ page, limit: 20, search: search || undefined, status });
          if (page === 1 && !search) saveOrdersPage(status, data);
          return data;
        },
        async () => (page === 1 ? ((await readOrdersPage(status, search || undefined)) ?? EMPTY_PAGE) : null)
      );
      return { items: result.orders, pagination: result.pagination };
    },
    [filter]
  );

  const list = usePaginatedList(fetchPage);
  useRevalidateOnFocus(list.revalidate);

  // A queued order just reached the server: reload so the real order (with
  // its number) takes the place of the local one.
  const { revalidate } = list;
  useEffect(() => onOrderSynced(() => revalidate()), [revalidate]);

  // Orders still on the device, newest first, narrowed by the same segment
  // and search as the server list, and shown above it.
  const pending = usePendingOrders();
  const rows = useMemo(() => {
    const needle = list.search.trim().toLowerCase();
    const local = pending
      .filter((order) => filter === 'all' || filter === 'offline' || filter === order.status)
      .filter(
        (order) =>
          !needle ||
          order.customer.name.toLowerCase().includes(needle) ||
          order.customer.code.toLowerCase().includes(needle)
      )
      .reverse();
    return [...local, ...list.items];
  }, [pending, filter, list.search, list.items]);

  const segments: Segment<Filter>[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'offline', label: 'Offline', count: pending.length },
  ];

  // What the ⋯ menu offers depends on where the order is in its life.
  function actionsFor(order: OrderSummary): SheetAction[] {
    const view: SheetAction = { icon: 'eye-outline', label: 'View details', onPress: () => router.push(`/orders/${order.id}`) };
    const reorder: SheetAction = {
      icon: 'repeat-outline',
      label: 'Re-order',
      onPress: () => router.push({ pathname: '/orders/new', params: { reorderFrom: order.id } }),
    };
    if (order.status === 'draft') {
      return [
        {
          icon: 'create-outline',
          label: 'Continue draft',
          onPress: () => router.push({ pathname: '/orders/new', params: { draftId: order.id } }),
        },
        view,
      ];
    }
    if (order.status === 'submitted') {
      return [view, { icon: 'share-social-outline', label: 'Share receipt', onPress: () => setReceiptId(order.id) }, reorder];
    }
    return [view, reorder];
  }

  const total = list.pagination?.total;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Orders"
        eyebrow={filter === 'offline' ? `${pending.length} on this device` : total !== undefined ? `${total} orders` : null}
        right={
          <PressableScale style={styles.newButton} onPress={() => router.push('/orders/new')} accessibilityLabel="New order">
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newButtonText}>New</Text>
          </PressableScale>
        }
      />

      <View style={styles.controls}>
        <SyncStatusBar />
        <SearchField value={list.search} onChangeText={list.setSearch} placeholder="Search order no. or customer" />
      </View>

      <SegmentedControl segments={segments} value={filter} onChange={setFilter} />

      {list.status === 'loading' && filter !== 'offline' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load orders: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => (isPending(item) ? item.clientRef : item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) =>
            isPending(item) ? (
              <OrderCard order={pendingRow(item)} onPress={() => showPendingOrder(item)} />
            ) : (
              <OrderCard order={item} onPress={() => router.push(`/orders/${item.id}`)} onMore={() => setMenuOrder(item)} />
            )
          }
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon={filter === 'offline' ? 'cloud-done-outline' : 'receipt-outline'}
              title={list.search ? 'No matching orders' : EMPTY_COPY[filter].title}
              message={list.search ? 'Try a different search or segment.' : EMPTY_COPY[filter].message}
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <ActionSheet
        visible={menuOrder !== null}
        title={menuOrder?.customer?.name ?? 'Order'}
        subtitle={menuOrder?.orderNumber || (menuOrder?.status === 'draft' ? 'Draft' : undefined)}
        actions={menuOrder ? actionsFor(menuOrder) : []}
        onClose={() => setMenuOrder(null)}
      />
      <OrderReceiptModal visible={receiptId !== null} orderId={receiptId} onClose={() => setReceiptId(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  newButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
});
