import { Stack, useLocalSearchParams } from 'expo-router';

import { ProductDetailsScreen } from '@/screens/ProductDetailsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Product' }} />
      <ProductDetailsScreen id={id} />
    </>
  );
}
