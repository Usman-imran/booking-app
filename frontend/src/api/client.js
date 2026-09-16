import { Capacitor } from '@capacitor/core';

// Where the backend lives. Set VITE_API_BASE_URL at build time (see
// frontend/.env.example) — e.g. http://192.168.1.20:5000/api for a phone on
// the same Wi-Fi, or https://api.example.com/api once the backend is hosted.
//
// There is deliberately no localhost fallback on a device: inside the Android
// WebView "localhost" is the phone itself, not the machine running the
// backend, so an unconfigured mobile build would silently fail against a
// server that isn't there. Browser builds keep the localhost default so
// `npm run dev` works with no .env at all.
const CONFIGURED_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();
const BROWSER_FALLBACK_BASE_URL = 'http://localhost:5000/api';

function getApiBaseUrl() {
  if (CONFIGURED_BASE_URL) {
    return CONFIGURED_BASE_URL.replace(/\/+$/, '');
  }

  if (Capacitor.isNativePlatform()) {
    throw new Error(
      'No API server configured for this build. Rebuild with VITE_API_BASE_URL set to the backend address reachable from this device, e.g. http://192.168.1.20:5000/api'
    );
  }

  return BROWSER_FALLBACK_BASE_URL;
}

let authToken = null;

// Called by AuthContext on login/logout/hydration so every request can
// carry the current token without callers passing it explicitly.
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, { method = 'GET', body, headers, ...rest } = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

// Uploads a multipart form (a spreadsheet, currently). The body must NOT be
// JSON-stringified and must NOT carry a Content-Type header — the browser
// sets its own with the multipart boundary, and overriding it makes the
// request unparseable on the server.
async function postForm(path, formData) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);

  // A partial import answers 207 with the same body shape as a success, so
  // "not ok" is the only thing that counts as a failure here; the caller
  // decides what to make of the row-level failures inside a 2xx body.
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    // A rejected import returns its per-row detail in the body, not in
    // error.message, so it is carried through rather than thrown away.
    error.body = data;
    throw error;
  }

  return data;
}

// Fetches a binary response (a generated spreadsheet) as a Blob. A plain
// <a href> can't be used: these routes require the bearer token, which a
// browser navigation would not send.
async function getBlob(path) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `Request failed with status ${response.status}`);
  }

  return response.blob();
}

const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  postForm,
  getBlob,
};

export default apiClient;
