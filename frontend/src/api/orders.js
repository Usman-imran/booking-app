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

// Creates an order. `status` is 'submitted' (default) or 'draft'; the body
// carries only what the booker chose — customer, remarks, and a quantity
// per product. Prices, discounts, bonus quantities, totals and the order
// number are all decided by the server (see the Orders API section of the
// README), so there is nothing else for the client to send.
export function createOrder({ customerId, status, remarks, items }) {
  return apiClient.post('/orders', { customerId, status, remarks, items });
}

export function listOrders({ page = 1, limit = 20, search, status, customerId, bookerId, dateFrom, dateTo } = {}) {
  return apiClient.get(`/orders${buildQuery({ page, limit, search, status, customerId, bookerId, dateFrom, dateTo })}`);
}

export function getOrder(id) {
  return apiClient.get(`/orders/${id}`);
}

// Replaces a draft's contents. Same body as createOrder minus `status` — an
// edit never changes an order's status, and only drafts can be edited at
// all. The lines are re-priced server-side from the products' current
// values.
export function updateDraftOrder(id, { customerId, remarks, items }) {
  return apiClient.put(`/orders/${id}`, { customerId, remarks, items });
}

// Draft -> Submitted. This is where the order gets its final
// ORD-YYYYMMDD-XXX number and becomes permanent.
export function submitDraftOrder(id) {
  return apiClient.post(`/orders/${id}/submit`);
}

// Deletes a draft outright. Only drafts can be deleted — submitted orders
// are kept permanently and can only be cancelled.
export function deleteDraftOrder(id) {
  return apiClient.delete(`/orders/${id}`);
}

// Submitted -> Cancelled (PROJECT_SPEC.md §15). The order is kept in full —
// lines, totals and order number all stay — and is simply marked cancelled.
// This is the only thing that can be done to a submitted order: there is no
// endpoint that edits one.
export function cancelOrder(id) {
  return apiClient.post(`/orders/${id}/cancel`);
}
