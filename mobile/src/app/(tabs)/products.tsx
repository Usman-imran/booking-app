import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PressableScale } from '@/components/PressableScale';
import { listProducts, type Product } from '@/lib/api/products';
import { cardShadow, colors, formatMoney, radius, spacing } from '@/lib/theme';
import { usePaginatedList, useRevalidateOnFocus } from '@/lib/usePaginatedList';

function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const hasScheme = product.schemeEnabled && product.schemePurchaseQty && product.schemeBonusQty;
  return (
    <PressableScale style={styles.card} onPress={onPress}>
      <View style={styles.cardIcon}>
        <Ionicons name="cube-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.cardMain}>
        <Text style={styles.productName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.productMeta} numberOfLines={1}>
          {product.code} · {product.company}
          {product.packing ? ` · ${product.packing}` : ''}
        </Text>
        <View style={styles.tags}>
          {!product.isActive ? <Text style={[styles.tag, styles.tagInactive]}>Inactive</Text> : null}
          {hasScheme ? (
            <Text style={[styles.tag, styles.tagScheme]}>
              {product.schemePurchaseQty}+{product.schemeBonusQty} free
            </Text>
          ) : null}
          {product.discount > 0 ? <Text style={[styles.tag, styles.tagDiscount]}>{product.discount}% off</Text> : null}
        </View>
      </View>
      <View style={styles.cardEnd}>
        <Text style={styles.price}>{formatMoney(product.salePrice)}</Text>
        <Text style={styles.mrp}>MRP {formatMoney(product.mrp)}</Text>
      </View>
    </PressableScale>
  );
}

export default function Products() {
  const fetchPage = useCallback(async (page: number, search: string) => {
    const result = await listProducts({ page, limit: 25, search: search || undefined });
    return { items: result.products, pagination: result.pagination };
  }, []);

  const list = usePaginatedList(fetchPage);

  useRevalidateOnFocus(list.revalidate);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Products</Text>
          {list.pagination ? <Text style={styles.count}>{list.pagination.total} total</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/products/import')}
            hitSlop={6}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/products/new')}
            hitSlop={6}
            style={({ pressed }) => [styles.iconButton, styles.iconButtonPrimary, pressed && { opacity: 0.7 }]}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>



      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, code or company"
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
        <ErrorState message={`Could not load products: ${list.error}`} onRetry={list.retry} />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProductCard product={item} onPress={() => router.push(`/products/${item.id}`)} />
          )}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={colors.primary} />
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={list.search ? 'No matching products' : 'No products yet'}
              message={list.search ? 'Try a different search.' : 'Products you add will appear here.'}
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
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  iconButtonPrimary: { backgroundColor: colors.primary },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMain: { flex: 1, gap: 2 },
  cardEnd: { alignItems: 'flex-end' },
  productName: { fontSize: 14, fontWeight: '700', color: colors.text },
  productMeta: { fontSize: 12, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  tagInactive: { color: colors.textMuted, backgroundColor: colors.surfaceMuted },
  tagScheme: { color: colors.success, backgroundColor: colors.successSoft },
  tagDiscount: { color: colors.warning, backgroundColor: colors.warningSoft },
  price: { fontSize: 15, fontWeight: '700', color: colors.text },
  mrp: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
