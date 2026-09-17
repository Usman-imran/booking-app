import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/ErrorState';
import { CustomerForm } from '@/components/form/CustomerForm';
import { getCustomer, updateCustomer, type Customer, type CustomerInput } from '@/lib/api/customers';
import { colors } from '@/lib/theme';

// Mirrors the web's EditCustomer: load, edit with the shared form, save,
// then return to the details page.
export function EditCustomerScreen({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await getCustomer(id);
      setCustomer(data.customer);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(values: CustomerInput) {
    await updateCustomer(id, values);
    router.back();
  }

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error' || !customer) {
    return <ErrorState message={`Could not load customer: ${error}`} onRetry={load} />;
  }

  return (
    <CustomerForm
      initialValues={{
        name: customer.name,
        code: customer.code,
        contactPerson: customer.contactPerson ?? '',
        phone: customer.phone ?? '',
        alternatePhone: customer.alternatePhone ?? '',
        address: customer.address ?? '',
        cityArea: customer.cityArea ?? '',
        customerType: customer.customerType ?? '',
      }}
      submitLabel="Save Changes"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
