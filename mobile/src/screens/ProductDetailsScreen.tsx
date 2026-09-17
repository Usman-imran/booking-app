import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DetailCard } from '@/components/DetailCard';
import { ErrorState } from '@/components/ErrorState';
import { Banner } from '@/components/form/Banner';
import { Button } from '@/components/form/Button';
import { deactivateProduct, getProduct, updateProduct, type Product } from '@/lib/api/products';
import { formatScheme } from '@/lib/orderCalc';
import { colors, formatDate, formatMoney, radius, spacing } from '@/lib/theme';

// Mirrors the web's ProductDetails: identity, pricing, bonus scheme, Edit,
// and the deactivate / reactivate toggle. Reloads whenever the screen
// regains focus so edits show as soon as the Edit screen is dismissed.
export function ProductDetailsScreen({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getProduct(id);
      setProduct(data.product);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  async function toggleActive() {
    if (!product) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (product.isActive) {
        await deactivateProduct(id);
      } else {
        await updateProduct(id, { isActive: true });
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsMutating(false);
    }
  }

  function confirmToggle() {
    if (!product) return;
    Alert.alert(
      product.isActive ? 'Deactivate product?' : 'Reactivate product?',
      product.isActive
        ? `${product.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
        : `${product.name} will be marked active again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: product.isActive ? 'Deactivate' : 'Reactivate',
          style: product.isActive ? 'destructive' : 'default',
          onPress: toggleActive,
        },
      ]
    );
  }

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error' || !product) {
    return <ErrorState message={`Could not load product: ${error}`} onRetry={load} />;
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="cube" size={30} color={colors.primary} />
        </View>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.code}>
          {product.code}
          {product.company ? ` · ${product.company}` : ''}
        </Text>
        <View style={styles.pills}>
          <Text style={[styles.statusPill, product.isActive ? styles.statusActive : styles.statusInactive]}>
            {product.isActive ? 'Active' : 'Inactive'}
          </Text>
          {product.schemeEnabled ? <Text style={[styles.statusPill, styles.statusScheme]}>{formatScheme(product)}</Text> : null}
        </View>
      </View>

      {actionError ? <Banner kind="error">{actionError}</Banner> : null}

      <View style={styles.priceRow}>
        <View style={[styles.priceCard, styles.priceCardPrimary]}>
          <Text style={styles.priceLabelPrimary}>Sale Price</Text>
          <Text style={styles.priceValuePrimary}>{formatMoney(product.salePrice)}</Text>
        </View>
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>MRP</Text>
          <Text style={styles.priceValue}>{formatMoney(product.mrp)}</Text>
        </View>
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Discount</Text>
          <Text style={styles.priceValue}>{formatMoney(product.discount)}%</Text>
        </View>
      </View>

      <DetailCard
        title="Product"
        items={[
          { label: 'Product Code', value: product.code },
          { label: 'Company / Manufacturer', value: product.company },
          { label: 'Packing', value: product.packing },
          { label: 'Unit', value: product.unit },
        ]}
      />

      {product.schemeEnabled ? (
        <DetailCard
          title="Bonus Scheme"
          items={[
            { label: 'Scheme', value: formatScheme(product), highlight: true },
            { label: 'Purchase Quantity', value: product.schemePurchaseQty },
            { label: 'Bonus Quantity', value: product.schemeBonusQty },
          ]}
        />
      ) : (
        <DetailCard title="Bonus Scheme" items={[{ label: 'Status', value: 'No bonus scheme configured' }]} />
      )}

      <DetailCard
        title="History"
        items={[
          { label: 'Added', value: formatDate(product.createdAt) },
          { label: 'Last updated', value: formatDate(product.updatedAt) },
        ]}
      />

      <View style={styles.actions}>
        <Button
          title="Edit Product"
          icon="create-outline"
          onPress={() => router.push(`/products/${id}/edit`)}
          disabled={isMutating}
        />
        <Button
          title={product.isActive ? 'Deactivate' : 'Reactivate'}
          icon={product.isActive ? 'eye-off-outline' : 'eye-outline'}
          variant={product.isActive ? 'danger' : 'secondary'}
          onPress={confirmToggle}
          loading={isMutating}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  hero: { alignItems: 'center', gap: 4, paddingBottom: spacing.xl },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  code: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statusPill: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  statusActive: { color: colors.success, backgroundColor: colors.successSoft },
  statusInactive: { color: colors.danger, backgroundColor: colors.dangerSoft },
  statusScheme: { color: colors.primaryDark, backgroundColor: colors.primarySoft, textTransform: 'none' },
  priceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  priceCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceCardPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  priceLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  priceValue: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  priceLabelPrimary: { fontSize: 11, fontWeight: '600', color: '#dceaff' },
  priceValuePrimary: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 4 },
  actions: { gap: spacing.md, marginTop: spacing.sm },
});
