import apiClient from './client';
import type { Pagination } from './orders';

export type ReportType = 'daily' | 'monthly' | 'customer' | 'product' | 'company' | 'range';

export type ReportSummary = {
  orders: number;
  sales: number;
  subtotal: number;
  discountTotal: number;
  paidQty: number;
  bonusQty: number;
};

// One row of whichever report was asked for; only the fields that
// grouping produces are present.
export type ReportRow = {
  period?: string;
  year?: number;
  month?: number;
  customerId?: string;
  customerName?: string;
  customerCode?: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  // Company-wise: null when the products had no manufacturer recorded.
  company?: string | null;
  products?: number;
  paidQty?: number;
  bonusQty?: number;
  orders: number;
  sales: number;
};

export type Report = {
  type: ReportType;
  dateFrom: string | null;
  dateTo: string | null;
  summary: ReportSummary;
  rows: ReportRow[];
  pagination: Pagination;
};

export type ReportParams = { type: ReportType; dateFrom?: string; dateTo?: string; page?: number; limit?: number };

// Sales reports. Every figure comes from the backend's single definition of
// a valid sale - submitted orders only, bonus quantities worth nothing,
// discounts already applied. Nothing on the client recomputes sales.
export function getReport({ type, dateFrom, dateTo, page = 1, limit = 50 }: ReportParams): Promise<Report> {
  const query = new URLSearchParams({ type, page: String(page), limit: String(limit) });
  if (dateFrom) query.set('dateFrom', dateFrom);
  if (dateTo) query.set('dateTo', dateTo);
  return apiClient.get(`/reports?${query.toString()}`);
}
