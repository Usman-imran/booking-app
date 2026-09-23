import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { OrderCard } from '@/components/OrderCard';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { SegmentedControl, type Segment } from '@/components/SegmentedControl';
import { listOrders, type OrderStatus } from '@/lib/api/orders';
import { colors, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

type Filter = 'all' | OrderStatus;

// The four states an order can be in, in the order a booker thinks about
// them. "Pending" and "Completed" are the booker's words for the draft and
// submitted statuses the API uses.
//
// There is deliberately no "Offline Sync" segment: the app has no offline
// queue - every order is written straight to the server - so a segment for
// it would always be empty. Cancelled is the real fourth status and takes
// the slot.
const SEGMENTS: Segment<Filter>[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Pending' },
  { key: 'submitted', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Orders() {
  const [filter, setFilter] = useState<Filter>('all');
  // Only one card shows its quick actions at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The order whose receipt is open in the share sheet.
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const result = await listOrders({
        page,
        limit: 20,
        search: search || undefined,
        status: filter === 'all' ? undefined : filter,
      });
      return { items: result.orders, pagination: result.pagination };
    },
    [filter]
  );

  const list = usePaginatedList(fetchPage);
  useRevalidateOnFocus(list.revalidate);

  const total = list.pagination?.total;
  const subtitle =
    total === undefined ? null : `${total} ${total === 1 ? 'order' : 'orders'}${filter === 'all' ? '' : ' in view'}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Orders"
        subtitle={subtitle}
        cta={{ icon: 'add', label: 'New', onPress: () => router.push('/orders/new') }}
      />

      <View style={styles.controls}>
        <SearchField
          value={list.search}
          onChangeText={list.setSearch}
          placeholder="Search by order no. or customer"
        />
        <SegmentedControl
          segments={SEGMENTS}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setExpandedId(null);
          }}
        />
      </View>

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load orders: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              expanded={expandedId === item.id}
              onToggleActions={() => setExpandedId((current) => (current === item.id ? null : item.id))}
              onPress={() => router.push(`/orders/${item.id}`)}
              onReorder={() => router.push({ pathname: '/orders/new', params: { copyFrom: item.id } })}
              onShare={() => setReceiptOrderId(item.id)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={list.search ? 'No matching orders' : 'No orders here'}
              message={
                list.search
                  ? 'Try a different search or switch the filter.'
                  : filter === 'all'
                    ? 'Orders you book will appear here.'
                    : 'Nothing in this status yet.'
              }
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <OrderReceiptModal
        visible={receiptOrderId !== null}
        orderId={receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
});
