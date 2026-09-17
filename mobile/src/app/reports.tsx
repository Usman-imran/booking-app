import { Stack } from 'expo-router';

import { SalesReportsScreen } from '@/screens/SalesReportsScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Sales Reports' }} />
      <SalesReportsScreen />
    </>
  );
}
