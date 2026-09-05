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

export function listProducts({ page = 1, limit = 20, search, isActive } = {}) {
  return apiClient.get(`/products${buildQuery({ page, limit, search, isActive })}`);
}

export function getProduct(id) {
  return apiClient.get(`/products/${id}`);
}

export function createProduct(data) {
  return apiClient.post('/products', data);
}

export function updateProduct(id, data) {
  return apiClient.put(`/products/${id}`, data);
}

export function deactivateProduct(id) {
  return apiClient.delete(`/products/${id}`);
}
