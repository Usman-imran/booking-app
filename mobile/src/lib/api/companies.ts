import apiClient from './client';

export type CompanySummary = { company: string; productCount: number };

// Every manufacturer that has at least one active product, with its count.
// Companies aren't an entity - Company is a field on the product - so this
// list is derived from the products and is never paginated or searched
// server-side: it is bounded by how many manufacturers a distributor deals
// with, so the screen filters it locally.
export function listCompanies(): Promise<{ companies: CompanySummary[]; total: number; totalProducts: number }> {
  return apiClient.get('/companies');
}
