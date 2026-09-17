import { router } from 'expo-router';

import { ProductForm } from '@/components/form/ProductForm';
import { createProduct, type ProductInput } from '@/lib/api/products';

// Mirrors the web's AddProduct: create, then land on the new record.
export function AddProductScreen() {
  async function handleSubmit(payload: ProductInput) {
    const { product } = await createProduct(payload);
    router.replace(`/products/${product.id}`);
  }

  return (
    <ProductForm submitLabel="Create Product" onSubmit={handleSubmit} onCancel={() => router.back()} showPhotoPicker />
  );
}
