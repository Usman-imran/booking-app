import apiClient from './client.js';

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export function listCustomers({ page = 1, limit = 20, search, isActive } = {}) {
  return apiClient.get(`/customers${buildQuery({ page, limit, search, isActive })}`);
}

export function getCustomer(id) {
  return apiClient.get(`/customers/${id}`);
}

export function createCustomer(data) {
  return apiClient.post('/customers', data);
}

export function updateCustomer(id, data) {
  return apiClient.put(`/customers/${id}`, data);
}

export function deactivateCustomer(id) {
  return apiClient.delete(`/customers/${id}`);
}
