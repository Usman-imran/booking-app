import apiClient from './client';
import type { Pagination } from './orders';

export type Customer = {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  phone: string | null;
  alternatePhone: string | null;
  address: string | null;
  cityArea: string | null;
  customerType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// What the form sends - every field the API accepts on create. Blank
// optional fields are sent as '' and the server stores them as null, which
// is exactly what the web form does.
export type CustomerInput = {
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  alternatePhone: string;
  address: string;
  cityArea: string;
  customerType: string;
};

export type ListCustomersParams = { page?: number; limit?: number; search?: string; isActive?: boolean; cityArea?: string };

export function listCustomers(
  params: ListCustomersParams = {}
): Promise<{ customers: Customer[]; pagination: Pagination }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params.cityArea) query.set('cityArea', params.cityArea);
  const suffix = query.toString();
  return apiClient.get(`/customers${suffix ? `?${suffix}` : ''}`);
}

// The city/areas the customers are in, most customers first - the area
// filter's chips.
export function listCustomerAreas(): Promise<{ areas: { area: string; customers: number }[] }> {
  return apiClient.get('/customers/areas');
}

export function getCustomer(id: string): Promise<{ customer: Customer }> {
  return apiClient.get(`/customers/${id}`);
}

export function createCustomer(input: CustomerInput): Promise<{ customer: Customer }> {
  return apiClient.post('/customers', input);
}

// Partial update: a field missing from the body is left untouched, so
// `{ isActive: true }` alone reactivates a customer.
export function updateCustomer(
  id: string,
  input: Partial<CustomerInput> & { isActive?: boolean }
): Promise<{ customer: Customer }> {
  return apiClient.put(`/customers/${id}`, input);
}

// Soft delete - the customer is marked inactive and can be reactivated.
export function deactivateCustomer(id: string): Promise<{ customer: Customer }> {
  return apiClient.delete(`/customers/${id}`);
}
