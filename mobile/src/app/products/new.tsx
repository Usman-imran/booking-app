import { Stack } from 'expo-router';

import { AddProductScreen } from '@/screens/AddProductScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function AddProductRoute() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Add Product' }} />
      <AddProductScreen />
    </>
  );
}
