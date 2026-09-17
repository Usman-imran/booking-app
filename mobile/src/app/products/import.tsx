import { Stack } from 'expo-router';

import { BulkAddProductsScreen } from '@/screens/BulkAddProductsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function ImportProductsRoute() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Import Products' }} />
      <BulkAddProductsScreen />
    </>
  );
}
