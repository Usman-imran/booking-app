import { Stack } from 'expo-router';

import { CompaniesScreen } from '@/screens/CompaniesScreen';
import { stackHeader } from '@/lib/stackHeader';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: 'Companies' }} />
      <CompaniesScreen />
    </>
  );
}
