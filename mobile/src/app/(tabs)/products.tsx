import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { ProductGridCard, ProductListCard } from '@/components/products/ProductCard';
import { Chip } from '@/components/ui/Chip';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SearchField } from '@/components/ui/SearchField';
import { listProductCompanies, listProducts, type Product } from '@/lib/api/products';
import { cachedCompanies, searchCachedProducts, withOfflineFallback } from '@/lib/offline/offlineCache';
import { colors, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

type ViewMode = 'list' | 'grid';

// How many products the offline copy will show at once. The device holds
// the whole catalogue, but a list that long has to stop somewhere.
const OFFLINE_LIMIT = 500;

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
            style={({ pressed }) => [styles.toggleButton, active && styles.toggleActive, pressed && { opacity: 0.6 }]}>
            <Ionicons name={mode} size={16} color={active ? colors.primaryDark : colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

// The catalogue: search and the company carousel pinned at the top, the
// products below as rows or tiles. Offline it falls back to the copy saved
// on the device, the same way Orders and Customers do.
export default function Products() {
  const [view, setView] = useState<ViewMode>('list');
  const [company, setCompany] = useState<string | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);

  // The manufacturers behind the carousel. Quiet on failure: offline there
  // are still the companies of whatever is saved on the device.
  const loadCompanies = useCallback(() => {
    listProductCompanies()
      .then((data) => setCompanies(data.companies))
      .catch(() => setCompanies(cachedCompanies()));
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const { data } = await withOfflineFallback(
        () =>
          listProducts({ page, limit: 25, search: search || undefined, company: company ?? undefined }).then(
            (result) => ({ items: result.products, pagination: result.pagination })
          ),
        () => {
          // Only one "page" is held locally, so scrolling past the first
          // just stops rather than repeating it.
          if (page > 1) return null;
          const rows = searchCachedProducts({ search, company: company ?? undefined, limit: OFFLINE_LIMIT });
          if (!rows) return null;
          return {
            items: rows as Product[],
            pagination: { page: 1, limit: rows.length, total: rows.length, totalPages: 1 },
          };
        }
      );
      return data;
    },
    [company]
  );

  const list = usePaginatedList(fetchPage);
  const { revalidate } = list;
  useRevalidateOnFocus(
    useCallback(() => {
      revalidate();
      loadCompanies();
    }, [revalidate, loadCompanies])
  );

  const isGrid = view === 'grid';
  const total = list.pagination?.total;
  const eyebrow = total === undefined ? null : company ? `${total} in ${company}` : `${total} products`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Products"
        eyebrow={eyebrow}
        right={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/products/import')}
              hitSlop={6}
              accessibilityLabel="Import products"
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
            </Pressable>
            <PressableScale
              style={styles.newButton}
              onPress={() => router.push('/products/new')}
              accessibilityLabel="Add product">
              <Ionicons name="add" size={20} color="#fff" />
            </PressableScale>
          </View>
        }
      />

      {/* Pinned: search, view toggle and companies stay put while the list scrolls. */}
      <View style={styles.pinned}>
        <SearchField
          value={list.search}
          onChangeText={list.setSearch}
          placeholder="Search name, code or company"
          style={styles.search}
        />
        <View style={styles.filterRow}>
          <ViewToggle value={view} onChange={setView} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chips}>
            <Chip label="All" icon="apps-outline" active={company === null} onPress={() => setCompany(null)} />
            {companies.length > 0 ? <View style={styles.chipDivider} /> : null}
            {companies.map((name) => (
              <Chip
                key={name}
                label={name}
                active={company?.toLowerCase() === name.toLowerCase()}
                // Tapping the company you are already in clears the filter.
                onPress={() => setCompany((current) => (current?.toLowerCase() === name.toLowerCase() ? null : name))}
              />
            ))}
          </ScrollView>
        </View>
      </View>

      {list.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : list.status === 'error' ? (
        <ErrorState message={`Could not load products: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          // A FlatList cannot change its column count in place, so the key
          // rebuilds it when the view mode flips.
          key={view}
          data={list.items}
          keyExtractor={(item) => item.id}
          numColumns={isGrid ? 2 : 1}
          columnWrapperStyle={isGrid ? styles.column : undefined}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const open = () => router.push(`/products/${item.id}`);
            return isGrid ? (
              <ProductGridCard product={item} onPress={open} />
            ) : (
              <ProductListCard product={item} onPress={open} />
            );
          }}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={list.search || company ? 'No matching products' : 'No products yet'}
              message={
                list.search
                  ? 'Try a different search, or pick another company.'
                  : company
                    ? `Nothing in the catalogue for ${company} yet.`
                    : 'Add a product, or import your price list from a spreadsheet.'
              }
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },

  pinned: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: { marginHorizontal: spacing.xl },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  chips: { paddingRight: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },

  toggle: {
    flexDirection: 'row',
    gap: 2,
    marginLeft: spacing.xl,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButton: { width: 32, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  toggleActive: { backgroundColor: colors.surface },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  column: { gap: spacing.md },
  footer: { paddingVertical: spacing.lg },
});
