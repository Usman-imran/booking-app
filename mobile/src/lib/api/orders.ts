import apiClient from './client';

export type OrderStatus = 'draft' | 'submitted' | 'cancelled';

export type OrderCustomer = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  cityArea: string | null;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  customerId: string;
  status: OrderStatus;
  remarks: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  submittedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: OrderCustomer;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productCode: string;
  mrp: number;
  rate: number;
  discount: number;
  paidQty: number;
  bonusQty: number;
  schemePurchaseQty: number | null;
  schemeBonusQty: number | null;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
};

// The booker is only joined onto the detail payload, not list rows.
export type OrderBooker = { id: number; name: string; username: string };

export type OrderDetail = OrderSummary & { items: OrderItem[]; booker?: OrderBooker };

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export type ListOrdersParams = {
  page?: number;
  limit?: number;
  search?: string;
  // One status or several; the API accepts a comma-separated list.
  status?: OrderStatus | OrderStatus[];
};

export function listOrders(params: ListOrdersParams = {}): Promise<{ orders: OrderSummary[]; pagination: Pagination }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.status) {
    query.set('status', Array.isArray(params.status) ? params.status.join(',') : params.status);
  }
  const suffix = query.toString();
  return apiClient.get(`/orders${suffix ? `?${suffix}` : ''}`);
}

export function getOrder(id: string): Promise<{ order: OrderDetail }> {
  return apiClient.get(`/orders/${id}`);
}

// The body carries only what the booker chose - customer, remarks, and a
// quantity (plus optional discount) per product. Prices, bonus quantities,
// totals and the order number are all decided by the server.
export type OrderLineInput = { productId: string; quantity: number; discount: number | null };

export type OrderInput = { customerId: string; remarks: string | null; items: OrderLineInput[] };

export function createOrder(input: OrderInput & { status: 'draft' | 'submitted' }): Promise<{ order: OrderDetail }> {
  return apiClient.post('/orders', input);
}

// Replaces a draft's contents. Same body as createOrder minus `status` - an
// edit never changes an order's status, and only drafts can be edited.
export function updateDraftOrder(id: string, input: OrderInput): Promise<{ order: OrderDetail }> {
  return apiClient.put(`/orders/${id}`, input);
}

// Draft -> Submitted. This is where the order gets its final number.
export function submitDraftOrder(id: string): Promise<{ order: OrderDetail }> {
  return apiClient.post(`/orders/${id}/submit`);
}

// Deletes a draft outright. Only drafts can be deleted.
export function deleteDraftOrder(id: string): Promise<unknown> {
  return apiClient.delete(`/orders/${id}`);
}

// Submitted -> Cancelled. The order is kept in full and simply marked.
export function cancelOrder(id: string): Promise<{ order: OrderDetail }> {
  return apiClient.post(`/orders/${id}/cancel`);
}
