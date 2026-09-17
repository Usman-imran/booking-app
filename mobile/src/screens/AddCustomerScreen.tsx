import { router } from 'expo-router';

import { CustomerForm } from '@/components/form/CustomerForm';
import { createCustomer, type CustomerInput } from '@/lib/api/customers';

// Mirrors the web's AddCustomer: create, then land on the new record.
export function AddCustomerScreen() {
  async function handleSubmit(values: CustomerInput) {
    const { customer } = await createCustomer(values);
    router.replace(`/customers/${customer.id}`);
  }

  return <CustomerForm submitLabel="Create Customer" onSubmit={handleSubmit} onCancel={() => router.back()} />;
}
