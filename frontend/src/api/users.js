import apiClient from './client.js';

// Read-only list of bookers, used by the Orders module's Booker filter
// (PROJECT_SPEC.md §17). Includes inactive bookers, since they still own
// historical orders that must stay findable.
export function listBookers() {
  return apiClient.get('/users');
}
