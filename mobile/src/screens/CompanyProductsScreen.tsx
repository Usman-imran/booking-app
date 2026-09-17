import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { listProducts, type Product } from '@/lib/api/products';
import { formatScheme } from '@/lib/orderCalc';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

// One manufacturer's catalogue - active products only, filtered server-side
// by exact company name so browsing "GSK" can never pull in "GSK Consumer".
// Mirrors the web's CompanyProducts page.
export function CompanyProductsScreen({ company }: { company: string }) {
  const fetchPage = useCallback(
    async (page: number, search: string) => {
      const result = await listProducts({ page, limit: 25, search: search || undefined, company, isActive: true });
      return { items: result.products, pagination: result.pagination };
    },
    [company]
  );

  const list = usePaginatedList(fetchPage);
  useRevalidateOnFocus(list.revalidate);

  return (
    <View style={styles.flex}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search within ${company}`}
          placeholderTextColor={colors.textMuted}
          value={list.search}
          onChangeText={list.setSearch}
          autoCapitalize="none"
          autoCorrect={false}
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
        <ErrorState message={`Could not load products: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            list.pagination ? (
              <Text style={styles.count}>
                {list.pagination.total} active product{list.pagination.total === 1 ? '' : 's'}
                {list.search ? ' matching your search' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={list.search ? `No active product from ${company} matches` : `${company} has no active products`}
              message={
                list.search
                  ? 'Try a different search.'
                  : 'They may have been deactivated - the Products tab shows inactive products too.'
              }
            />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
          }
          renderItem={({ item }) => <ProductRow product={item} onPress={() => router.push(`/products/${item.id}`)} />}
        />
      )}
    </View>
  );
}

function ProductRow({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <PressableScale style={styles.row} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {product.code}
          {product.packing ? ` · ${product.packing}` : ''}
          {product.unit ? ` · ${product.unit}` : ''}
        </Text>
        <View style={styles.tags}>
          {product.discount > 0 ? <Text style={[styles.tag, styles.tagDiscount]}>{formatMoney(product.discount)}% off</Text> : null}
          {product.schemeEnabled ? <Text style={[styles.tag, styles.tagScheme]}>{formatScheme(product)}</Text> : null}
        </View>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.price}>{formatMoney(product.salePrice)}</Text>
        <Text style={styles.mrp}>MRP {formatMoney(product.mrp)}</Text>
      </View>
    </PressableScale>
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
  listContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl, flexGrow: 1 },
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
  rowEnd: { alignItems: 'flex-end' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  tagScheme: { color: colors.success, backgroundColor: colors.successSoft },
  tagDiscount: { color: colors.warning, backgroundColor: colors.warningSoft },
  price: { fontSize: 15, fontWeight: '700', color: colors.text },
  mrp: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
