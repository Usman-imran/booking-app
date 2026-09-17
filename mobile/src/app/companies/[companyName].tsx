import { Stack, useLocalSearchParams } from 'expo-router';

import { CompanyProductsScreen } from '@/screens/CompanyProductsScreen';
import { stackHeader } from '@/lib/stackHeader';

// The param arrives percent-decoded, so it is the real manufacturer name as
// stored on the products.
export default function Route() {
  const { companyName } = useLocalSearchParams<{ companyName: string }>();
  return (
    <>
      <Stack.Screen options={{ ...stackHeader, title: companyName }} />
      <CompanyProductsScreen company={companyName} />
    </>
  );
}
