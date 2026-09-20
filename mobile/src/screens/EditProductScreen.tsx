import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { newSchemeRow, ProductForm, type ProductFormValues } from '@/components/form/ProductForm';
import { getProduct, updateProduct, type Product, type ProductInput } from '@/lib/api/products';
import { colors } from '@/lib/theme';

// The form's starting values for a product as the server currently has it.
export function toProductFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    code: product.code,
    company: product.company ?? '',
    packing: product.packing ?? '',
    unit: product.unit ?? '',
    mrp: String(product.mrp),
    salePrice: String(product.salePrice),
    discount: String(product.discount),
    bonusSchemes: (product.bonusSchemes ?? []).map((tier) => newSchemeRow(tier)),
  };
}

// Mirrors the web's EditProduct: load, edit with the shared form, save,
// then return to the details page.
//
// The product is (re)loaded every time the screen gains focus, not once on
// mount: the navigator can hand back a retained screen instance when Edit
// is opened again straight after a save, and a mount-only load would leave
// that instance showing the values from BEFORE the save. The form is keyed
// on the product's `updatedAt`, so every reload that brought back a newer
// product starts the form afresh from it instead of keeping stale edits.
export function EditProductScreen({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCurrent: () => boolean = () => true) => {
    setStatus('loading');
    setError(null);
    try {
      const data = await getProduct(id);
      if (!isCurrent()) return;
      setProduct(data.product);
      setStatus('ready');
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      // A load still in flight when the screen loses focus must not land
      // on top of whatever the next focus loads.
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load])
  );

  async function handleSubmit(payload: ProductInput) {
    const { product: saved } = await updateProduct(id, payload);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/products/${id}`);
    }
    // Keep the saved product so a retained instance is already current
    // even before its next focus reload completes. (A no-op if the
    // navigator unmounted this screen on the way back.)
    setProduct(saved);
  }

  if (status === 'loading' && !product) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error' || !product) {
    return <ErrorState message={`Could not load product: ${error}`} onRetry={() => load()} />;
  }

  return (
    <ProductForm
      key={product.updatedAt}
      initialValues={toProductFormValues(product)}
      submitLabel="Save Changes"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
