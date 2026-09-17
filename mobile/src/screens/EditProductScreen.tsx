import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { ProductForm } from '@/components/form/ProductForm';
import { getProduct, updateProduct, type Product, type ProductInput } from '@/lib/api/products';
import { colors } from '@/lib/theme';

// Mirrors the web's EditProduct: load, edit with the shared form, save,
// then return to the details page.
export function EditProductScreen({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(payload: ProductInput) {
    await updateProduct(id, payload);
    router.back();
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
    <ProductForm
      initialValues={{
        name: product.name,
        code: product.code,
        company: product.company ?? '',
        packing: product.packing ?? '',
        unit: product.unit ?? '',
        mrp: String(product.mrp),
        salePrice: String(product.salePrice),
        discount: String(product.discount),
        schemeEnabled: product.schemeEnabled,
        schemePurchaseQty: product.schemePurchaseQty !== null ? String(product.schemePurchaseQty) : '',
        schemeBonusQty: product.schemeBonusQty !== null ? String(product.schemeBonusQty) : '',
      }}
      submitLabel="Save Changes"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
