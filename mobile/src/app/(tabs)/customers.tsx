import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomerCard } from '@/components/CustomerCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FAB } from '@/components/FAB';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { listCustomers, type Customer } from '@/lib/api/customers';
import { colors, layout, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';
import { usePendingOrderTotals } from '@/lib/usePendingOrderTotals';

// The two fixed chips. Everything after them is a city, built from the
// customers actually on screen - a distributor's areas are their own, so
// hard-coding a list of them would be wrong for every second account.
const ACTIVE = '__active';
const OUTSTANDING = '__outstanding';

// Enough areas to be useful without the row becoming a second list.
const MAX_CITY_CHIPS = 12;

export default function Customers() {
  const [activeOnly, setActiveOnly] = useState(false);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [city, setCity] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const result = await listCustomers({
        page,
        limit: 25,
        search: search || undefined,
        // The only filter the API can do itself; the rest are applied to
        // what has been loaded.
        isActive: activeOnly ? true : undefined,
      });
      return { items: result.customers, pagination: result.pagination };
    },
    [activeOnly]
  );

  const list = usePaginatedList(fetchPage);
  const pending = usePendingOrderTotals();

  const revalidateAll = useCallback(() => {
    list.revalidate();
    pending.reload();
  }, [list, pending]);

  useRevalidateOnFocus(revalidateAll);

  const cities = useMemo(() => {
    const seen = new Set<string>();
    for (const customer of list.items as Customer[]) {
      const area = customer.cityArea?.trim();
      if (area) seen.add(area);
    }
    return [...seen].sort((a, b) => a.localeCompare(b)).slice(0, MAX_CITY_CHIPS);
  }, [list.items]);

  // A city that has scrolled out of the loaded set (a new search, say) is
  // treated as no city filter rather than as "nothing matches".
  const effectiveCity = city && cities.includes(city) ? city : null;

  const chips = useMemo<Chip<string>[]>(
    () => [
      { key: ACTIVE, label: 'Active', icon: 'checkmark-circle-outline' },
      { key: OUTSTANDING, label: 'Outstanding', icon: 'alert-circle-outline' },
      ...cities.map((area) => ({ key: area, label: area, icon: 'location-outline' as const })),
    ],
    [cities]
  );

  const selected = useMemo(() => {
    const keys: string[] = [];
    if (activeOnly) keys.push(ACTIVE);
    if (outstandingOnly) keys.push(OUTSTANDING);
    if (effectiveCity) keys.push(effectiveCity);
    return keys;
  }, [activeOnly, outstandingOnly, effectiveCity]);

  function toggleChip(key: string) {
    if (key === ACTIVE) return setActiveOnly((current) => !current);
    if (key === OUTSTANDING) return setOutstandingOnly((current) => !current);
    // Areas are mutually exclusive: a shop is in one of them.
    setCity((current) => (current === key ? null : key));
  }

  const visible = useMemo(
    () =>
      (list.items as Customer[]).filter((customer) => {
        if (outstandingOnly && (pending.byCustomer.get(customer.id) ?? 0) <= 0) return false;
        if (effectiveCity && customer.cityArea?.trim() !== effectiveCity) return false;
        return true;
      }),
    [list.items, outstandingOnly, effectiveCity, pending.byCustomer]
  );

  const isFiltered = outstandingOnly || effectiveCity !== null;
  const total = list.pagination?.total;
  const subtitle =
    total === undefined ? null : `${total} ${total === 1 ? 'shop' : 'shops'}${activeOnly ? ' active' : ''}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Customers"
        subtitle={subtitle}
        actions={[{ icon: 'business-outline', label: 'Companies', onPress: () => router.push('/companies') }]}
      />

      {/* Search and chips sit outside the list, so they stay put while it scrolls. */}
      <View style={styles.search}>
        <SearchField value={list.search} onChangeText={list.setSearch} placeholder="Search by shop name or code" />
      </View>
      <FilterChips chips={chips} selected={selected} onToggle={toggleChip} />

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load customers: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <CustomerCard
              customer={item}
              pendingTotal={pending.byCustomer.get(item.id) ?? 0}
              onPress={() => router.push(`/customers/${item.id}`)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={revalidateAll} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            // The chips above filter what has been loaded, not the whole
            // account, so say so rather than let the count look wrong.
            isFiltered && list.items.length > 0 ? (
              <Text style={styles.filterNote}>
                {visible.length} of {list.items.length} loaded {list.items.length === 1 ? 'shop' : 'shops'} match
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={list.search || isFiltered ? 'No matching customers' : 'No customers yet'}
              message={
                list.search || isFiltered
                  ? 'Try a different search, or clear the filters above.'
                  : 'Add your first shop with the + button.'
              }
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <FAB icon="person-add" label="Add New Customer" onPress={() => router.push('/customers/new')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  search: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    // Clears the FAB so the last card is never trapped underneath it.
    paddingBottom: layout.fabSize + layout.fabInset * 2,
    flexGrow: 1,
  },
  filterNote: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  footer: { paddingVertical: spacing.lg },
});
