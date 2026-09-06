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

// A month's targets alongside what was actually achieved
// (PROJECT_SPEC.md §19). Achieved, remaining, achievement % and status are
// all computed by the backend from the same definition of a valid sale that
// Sales Reports use (§34) — nothing here recalculates them.
//
// `scope`: 'all' also returns company targets (and any manufacturer that
// sold this month without one); 'overall' returns just the month's target.
export function getTargets({ year, month, scope = 'all' } = {}) {
  return apiClient.get(`/targets${buildQuery({ year, month, scope })}`);
}

// Sets the target for a month and scope, creating it if it doesn't exist.
// Addressed by month/company rather than by id, so saving the form twice
// sets the same value instead of failing the second time. Omit `company`
// (or pass null) for the month's overall target.
export function setTarget({ year, month, company, targetAmount }) {
  return apiClient.put('/targets', { year, month, company, targetAmount });
}

export function deleteTarget(id) {
  return apiClient.delete(`/targets/${id}`);
}
