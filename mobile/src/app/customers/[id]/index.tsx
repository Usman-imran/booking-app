import { Stack, useLocalSearchParams } from 'expo-router';

import { CustomerDetailsScreen } from '@/screens/CustomerDetailsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Customer' }} />
      <CustomerDetailsScreen id={id} />
    </>
  );
}
