import apiClient from './client.js';

// Every manufacturer that has at least one active product, with its count.
//
// Not paginated and not searched server-side: the list is bounded by how
// many manufacturers a distributor deals with, so the Companies page holds
// it and filters in the browser rather than firing a request per keystroke.
export function listCompanies() {
  return apiClient.get('/companies');
}
