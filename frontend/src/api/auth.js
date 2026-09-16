import apiClient from './client.js';

// Creates an account. Registration is open to anyone, and each account is
// its own private workspace. Returns `{ token, user }` for the new account,
// which the caller adopts to sign straight in.
export function register({ name, username, password, companyName, phone }) {
  return apiClient.post('/auth/register', { name, username, password, companyName, phone });
}

// Renames the business for the signed-in account only. Returns the
// refreshed user.
export function updateCompanyName(companyName) {
  return apiClient.put('/auth/company', { companyName });
}
