import { Stack, useLocalSearchParams } from 'expo-router';

import { EditCustomerScreen } from '@/screens/EditCustomerScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Edit Customer' }} />
      <EditCustomerScreen id={id} />
    </>
  );
}
