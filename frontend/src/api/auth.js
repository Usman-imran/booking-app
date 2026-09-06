import apiClient from './client.js';

// Whether a first account can be created without signing in. Used by the
// sign-in page to offer the link only when it would actually work.
export function getRegistrationStatus() {
  return apiClient.get('/auth/registration-status');
}

// Creates a booker. Open to anyone only while the system has no users — the
// first-run account that names the business; after that the caller must be
// a signed-in booker (the client sends its token automatically).
//
// Returns `{ token, user }`. The token belongs to the NEW account, so the
// caller decides whether to adopt it: first-run signup should, an existing
// booker adding a colleague must not.
export function register({ name, username, password, companyName, phone }) {
  return apiClient.post('/auth/register', { name, username, password, companyName, phone });
}

// Renames the business. Applies to every account on the installation —
// there is one business per installation, so the sidebar and receipts must
// not disagree between bookers. Returns the refreshed user and how many
// accounts were updated.
export function updateCompanyName(companyName) {
  return apiClient.put('/auth/company', { companyName });
}
