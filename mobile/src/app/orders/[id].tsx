import { Stack, useLocalSearchParams } from 'expo-router';

import { OrderDetailsScreen } from '@/screens/OrderDetailsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function OrderDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Order' }} />
      <OrderDetailsScreen id={id} />
    </>
  );
}
