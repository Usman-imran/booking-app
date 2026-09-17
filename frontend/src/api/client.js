const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

let authToken = null;

// fetch() rejects with a bare TypeError ("Failed to fetch") whenever the
// browser got NO response: backend not running, wrong port, CORS blocked,
// or the network dropped. The message says nothing about which. This
// replaces it with one that names the URL and the likely causes, and logs
// the original error so the console still has the full detail.
class NetworkError extends Error {
  constructor(url, cause) {
    super(
      `Could not reach the server at ${url}. ` +
        'Check that the backend is running, that VITE_API_BASE_URL points at it, ' +
        "and that its CORS_ORIGIN allows this page's origin."
    );
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function doFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error(`[api] ${options?.method || 'GET'} ${url} failed before a response arrived:`, err);
    throw new NetworkError(url, err);
  }
}

// Called by AuthContext on login/logout/hydration so every request can
// carry the current token without callers passing it explicitly.
export function setAuthToken(token) {
  authToken = token;
}

async function request(path, { method = 'GET', body, headers, ...rest } = {}) {
  const response = await doFetch(`${API_BASE_URL}${path}`, {
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
  const response = await doFetch(`${API_BASE_URL}${path}`, {
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
  const response = await doFetch(`${API_BASE_URL}${path}`, {
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
