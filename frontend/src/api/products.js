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

// `ids` is a comma-separated list that fetches exactly those products,
// ignoring pagination. It exists so reopening a saved draft can re-price
// every line from the products' current values in one request.
export function listProducts({ page = 1, limit = 20, search, isActive, ids, company } = {}) {
  return apiClient.get(`/products${buildQuery({ page, limit, search, isActive, company, ids: ids?.join(',') })}`);
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

// The distinct manufacturers products are assigned to — the options a
// company-wise target can be set against (PROJECT_SPEC.md §19 as extended).
export function listProductCompanies() {
  return apiClient.get('/products/companies');
}

// Checks a .xlsx/.csv file without saving anything — the first half of the
// two-step import. Returns { isValid, summary, errors, unmappedHeaders },
// where each error is { row, field, message } naming the spreadsheet row
// and column to fix.
export function validateProductImport(file) {
  const form = new FormData();
  form.append('file', file);
  return apiClient.postForm('/products/validate-bulk', form);
}

// Imports a validated .xlsx/.csv file. All-or-nothing: if anything is wrong
// nothing is written and the response carries the same row-level errors
// validate returns (thrown as a 422, with the body on `error.body`).
//
// Rows that left Product Code blank have one generated server-side.
export function bulkUploadProducts(file) {
  const form = new FormData();
  form.append('file', file);
  return apiClient.postForm('/products/bulk-upload', form);
}

// Downloads the sample import template as a Blob. Fetched rather than
// linked because the endpoint requires the auth token.
export function downloadProductTemplate() {
  return apiClient.getBlob('/products/sample-template');
}
