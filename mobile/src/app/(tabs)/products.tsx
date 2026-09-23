import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FAB } from '@/components/FAB';
import { FilterChips, type Chip } from '@/components/FilterChips';
import { ProductGridCard, ProductListCard } from '@/components/ProductCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchField } from '@/components/SearchField';
import { listProductCompanies, listProducts } from '@/lib/api/products';
import { colors, layout, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

type ViewMode = 'list' | 'grid';

// The "no company chosen" chip. A real company can't collide with it
// because the value is the manufacturer's own name.
const ALL_COMPANIES = '__all';

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <View style={styles.toggle}>
      {(['list', 'grid'] as const).map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={mode === 'list' ? 'List view' : 'Grid view'}
            style={({ pressed }) => [styles.toggleButton, active && styles.toggleButtonActive, pressed && styles.pressed]}>
            <Ionicons
              name={mode === 'list' ? 'list' : 'grid'}
              size={16}
              color={active ? colors.primary : colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Products() {
  const [view, setView] = useState<ViewMode>('list');
  const [company, setCompany] = useState<string>(ALL_COMPANIES);
  const [companies, setCompanies] = useState<string[]>([]);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const result = await listProducts({
        page,
        limit: 25,
        search: search || undefined,
        company: company === ALL_COMPANIES ? undefined : company,
      });
      return { items: result.products, pagination: result.pagination };
    },
    [company]
  );

  const list = usePaginatedList(fetchPage);
  useRevalidateOnFocus(list.revalidate);

  // The manufacturers behind the carousel. Loaded once: the set only
  // changes when a product is added under a new company, and a stale chip
  // row is a far smaller problem than a request on every keystroke.
  useEffect(() => {
    let cancelled = false;
    listProductCompanies()
      .then(({ companies: names }) => {
        if (!cancelled) setCompanies(names);
      })
      .catch(() => {
        // The carousel is a convenience; search still finds everything.
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chips = useMemo<Chip<string>[]>(
    () => [
      { key: ALL_COMPANIES, label: 'All', icon: 'apps-outline' },
      ...companies.map((name) => ({ key: name, label: name })),
    ],
    [companies]
  );

  const total = list.pagination?.total;
  const subtitle =
    total === undefined ? null : `${total} ${total === 1 ? 'product' : 'products'}${company === ALL_COMPANIES ? '' : ` · ${company}`}`;

  const isGrid = view === 'grid';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Products"
        subtitle={subtitle}
        actions={[
          { icon: 'cloud-upload-outline', label: 'Import products', onPress: () => router.push('/products/import') },
        ]}
      />

      <View style={styles.search}>
        <SearchField value={list.search} onChangeText={list.setSearch} placeholder="Search by name, code or company" />
      </View>

      <FilterChips
        chips={chips}
        selected={[company]}
        // One company at a time: tapping the active chip goes back to All.
        onToggle={(key) => setCompany((current) => (current === key ? ALL_COMPANIES : key))}
        leading={<ViewToggle value={view} onChange={setView} />}
      />

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load products: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          // FlatList cannot change its column count in place, so the key
          // forces a fresh list when the view mode flips.
          key={view}
          data={list.items}
          keyExtractor={(item) => item.id}
          numColumns={isGrid ? 2 : 1}
          columnWrapperStyle={isGrid ? styles.column : undefined}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            isGrid ? (
              <ProductGridCard product={item} onPress={() => router.push(`/products/${item.id}`)} />
            ) : (
              <ProductListCard product={item} onPress={() => router.push(`/products/${item.id}`)} />
            )
          }
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={list.search ? 'No matching products' : 'No products here'}
              message={
                list.search
                  ? 'Try a different search or pick another company.'
                  : company === ALL_COMPANIES
                    ? 'Products you add will appear here.'
                    : `Nothing in the catalogue for ${company} yet.`
              }
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
        />
      )}

      <FAB icon="add" label="Add product" onPress={() => router.push('/products/new')} />
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
  column: { gap: spacing.md },
  footer: { paddingVertical: spacing.lg },

  toggle: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.track,
  },
  toggleButton: {
    width: 32,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  toggleButtonActive: { backgroundColor: colors.surface },
  pressed: { opacity: 0.6 },
});
