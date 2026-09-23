import { Stack, useLocalSearchParams } from 'expo-router';

import { CreateOrderScreen } from '@/screens/CreateOrderScreen';
import { stackHeader } from '@/lib/stackHeader';

// /orders/new builds a new order; /orders/new?draftId=… continues a draft;
// /orders/new?reorderFrom=… starts a new order from a previous one.
export default function NewOrderRoute() {
  const { draftId, reorderFrom } = useLocalSearchParams<{ draftId?: string; reorderFrom?: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: draftId ? 'Continue Draft' : reorderFrom ? 'Re-order' : 'Create Order' }} />
      <CreateOrderScreen draftId={draftId || undefined} reorderFrom={reorderFrom || undefined} />
    </>
  );
}
