import { Stack, useLocalSearchParams } from 'expo-router';

import { EditProductScreen } from '@/screens/EditProductScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Edit Product' }} />
      <EditProductScreen id={id} />
    </>
  );
}
