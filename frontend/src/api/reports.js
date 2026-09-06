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

// Sales reports (PROJECT_SPEC.md §18). `type` picks the grouping:
// daily | monthly | customer | product | booker | range.
//
// Every figure comes from the backend's single definition of a valid sale
// (§34) — submitted orders only, bonus quantities worth nothing, discounts
// already applied. Nothing here recomputes sales; there is deliberately no
// client-side sales arithmetic anywhere in this app.
export function getReport({ type = 'daily', dateFrom, dateTo, page = 1, limit = 50 } = {}) {
  return apiClient.get(`/reports${buildQuery({ type, dateFrom, dateTo, page, limit })}`);
}
