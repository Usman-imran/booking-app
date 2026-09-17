import { Stack } from 'expo-router';

import { AddCustomerScreen } from '@/screens/AddCustomerScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function AddCustomerRoute() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Add Customer' }} />
      <AddCustomerScreen />
    </>
  );
}
