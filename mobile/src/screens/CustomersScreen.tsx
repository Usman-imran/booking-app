import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { listCustomers, type Customer } from '@/lib/api/customers';
import { cardShadow, colors, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

function CustomerRow({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  return (
    <PressableScale style={styles.row} onPress={onPress}>
      <Avatar name={customer.name} size={42} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {customer.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {customer.code}
          {customer.cityArea ? ` · ${customer.cityArea}` : ''}
          {customer.phone ? ` · ${customer.phone}` : ''}
        </Text>
        <View style={styles.tags}>
          {customer.customerType ? <Text style={styles.tag}>{customer.customerType}</Text> : null}
          {!customer.isActive ? <Text style={[styles.tag, styles.tagInactive]}>Inactive</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

// The customer list with search, refresh and infinite scroll, plus the entry
// point to Add Customer. Reloads on focus so a customer edited or added on a
// pushed screen is current when the list is shown again.
export function CustomersScreen() {
  const fetchPage = useCallback(async (page: number, search: string) => {
    const result = await listCustomers({ page, limit: 25, search: search || undefined });
    return { items: result.customers, pagination: result.pagination };
  }, []);

  const list = usePaginatedList(fetchPage);

  useRevalidateOnFocus(list.revalidate);

  return (
    <View style={styles.flex}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or code"
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

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load customers: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CustomerRow customer={item} onPress={() => router.push(`/customers/${item.id}`)} />
          )}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            list.pagination ? <Text style={styles.count}>{list.pagination.total} customers</Text> : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={list.search ? 'No matching customers' : 'No customers yet'}
              message={list.search ? 'Try a different search.' : 'Add your first customer with the + button.'}
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <PressableScale style={styles.fab} onPress={() => router.push('/customers/new')}>
        <Ionicons name="add" size={28} color="#fff" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  count: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 100, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  tags: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagInactive: { color: colors.textMuted, backgroundColor: colors.surfaceMuted },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
    shadowOpacity: 0.2,
    elevation: 6,
  },
});
