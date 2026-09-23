import { Stack, useLocalSearchParams } from 'expo-router';

import { CreateOrderScreen } from '@/screens/CreateOrderScreen';
import { stackHeader } from '@/lib/stackHeader';

// /orders/new builds a new order; ?draftId=… continues a saved draft;
// ?copyFrom=… starts a new order from a past one (the Re-order action on
// the Orders tab).
export default function NewOrderRoute() {
  const { draftId, copyFrom } = useLocalSearchParams<{ draftId?: string; copyFrom?: string }>();

  const title = draftId ? 'Continue Draft' : copyFrom ? 'Re-order' : 'Create Order';

  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title }} />
      <CreateOrderScreen draftId={draftId || undefined} copyFromId={copyFrom || undefined} />
    </>
  );
}
