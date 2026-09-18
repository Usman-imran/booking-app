import { Stack, useLocalSearchParams } from 'expo-router';

import { OrderDetailsScreen } from '@/screens/OrderDetailsScreen';
import { stackHeader } from '@/lib/stackHeader';

// /orders/:id shows the order; /orders/:id?share=1 also opens its invoice
// for sharing straight away - where a just-submitted draft lands.
export default function OrderDetailsRoute() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Order' }} />
      <OrderDetailsScreen id={id} shareOnOpen={share === '1'} />
    </>
  );
}
