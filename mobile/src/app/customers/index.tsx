import { Stack } from 'expo-router';

import { CustomersScreen } from '@/screens/CustomersScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function CustomersRoute() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Customers' }} />
      <CustomersScreen />
    </>
  );
}
