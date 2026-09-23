import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrderRow } from '@/components/OrderRow';
import { PressableScale } from '@/components/PressableScale';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { listOrders, type OrderStatus, type OrderSummary } from '@/lib/api/orders';
import { readOrdersPage, saveOrdersPage, withOfflineFallback } from '@/lib/offline/offlineCache';
import { usePendingOrders, type PendingOrder } from '@/lib/offline/offlineQueue';
import { discardQueuedOrder, onOrderSynced, retryQueuedOrder } from '@/lib/syncService';
import { colors, formatDateTime, formatMoney, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

const FILTERS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'draft', label: 'Drafts' },
  { key: 'cancelled', label: 'Cancelled' },
];

const EMPTY_PAGE = { orders: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };

function isPending(item: OrderSummary | PendingOrder): item is PendingOrder {
  return 'clientRef' in item;
}

// A queued order in the shape OrderRow draws. It has no order number until
// the server assigns one, so the slot says what it is instead.
function pendingRow(order: PendingOrder) {
  return {
    id: order.clientRef,
    orderNumber: order.status === 'draft' ? 'Draft - not yet synced' : 'Order no. assigned on sync',
    status: order.syncState === 'failed' ? 'sync_failed' : 'pending_sync',
    total: order.total,
    submittedAt: null,
    createdAt: order.createdAt,
    customer: order.customer,
  };
}

function showPendingOrder(order: PendingOrder) {
  const summary =
    `${order.itemCount} item${order.itemCount === 1 ? '' : 's'}, estimated total ${formatMoney(order.total)}. ` +
    `Saved on this device ${formatDateTime(order.createdAt)}.\n\n`;
  const discard = {
    text: 'Discard',
    style: 'destructive' as const,
    onPress: () =>
      Alert.alert('Discard this order?', 'It has not reached the server and will be deleted from this device.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => discardQueuedOrder(order.clientRef) },
      ]),
  };

  if (order.syncState === 'failed') {
    Alert.alert(
      `Could not sync - ${order.customer.name}`,
      `${summary}The server did not accept this order: ${order.lastError}\n\n` +
        'Retry once the problem is fixed, or discard it and book it again.',
      [{ text: 'Close', style: 'cancel' }, discard, { text: 'Retry', onPress: () => retryQueuedOrder(order.clientRef) }]
    );
    return;
  }
  Alert.alert(
    `Pending sync - ${order.customer.name}`,
    `${summary}It will be sent automatically when you are online.` +
      (order.lastError ? `\n\nLast attempt: ${order.lastError}` : ''),
    [{ text: 'Close', style: 'cancel' }, discard, { text: 'Sync now', onPress: () => retryQueuedOrder(order.clientRef) }]
  );
}

export default function Orders() {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');

  const fetchPage = useCallback(
    async (page: number, search: string) => {
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

  // Orders still on the device, newest first, narrowed by the same chip and
  // search as the server list, and shown above it.
  const pending = usePendingOrders();
  const rows = useMemo(() => {
    const needle = list.search.trim().toLowerCase();
    const local = pending
      .filter((order) => filter === 'all' || filter === order.status)
      .filter(
        (order) =>
          !needle ||
          order.customer.name.toLowerCase().includes(needle) ||
          order.customer.code.toLowerCase().includes(needle)
      )
      .reverse();
    return [...local, ...list.items];
  }, [pending, filter, list.search, list.items]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Orders</Text>
          {list.pagination ? <Text style={styles.count}>{list.pagination.total} total</Text> : null}
        </View>
        <PressableScale style={styles.newButton} onPress={() => router.push('/orders/new')}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newButtonText}>New Order</Text>
        </PressableScale>
      </View>

      <View style={styles.syncBar}>
        <SyncStatusBar />
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order no. or customer"
          placeholderTextColor={colors.textMuted}
          value={list.search}
          onChangeText={list.setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {list.search ? (
          <Pressable onPress={() => list.setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        {FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {list.status === 'loading' ? (
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
              <OrderRow order={pendingRow(item)} onPress={() => showPendingOrder(item)} />
            ) : (
              <OrderRow order={item} onPress={() => router.push(`/orders/${item.id}`)} />
            )
          }
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={list.search ? 'No matching orders' : 'No orders yet'}
              message={list.search ? 'Try a different search or filter.' : 'Orders you book will appear here.'}
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  count: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
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
  newButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  syncBar: { paddingHorizontal: spacing.xl },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
});
