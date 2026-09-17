import { Stack, useLocalSearchParams } from 'expo-router';

import { CreateOrderScreen } from '@/screens/CreateOrderScreen';
import { stackHeader } from '@/lib/stackHeader';

// /orders/new builds a new order; /orders/new?draftId=… continues a draft.
export default function NewOrderRoute() {
  const { draftId } = useLocalSearchParams<{ draftId?: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: draftId ? 'Continue Draft' : 'Create Order' }} />
      <CreateOrderScreen draftId={draftId || undefined} />
    </>
  );
}
