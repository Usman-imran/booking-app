import { API_BASE_URL } from './config';

let authToken: string | null = null;

// Called by AuthContext on login/logout/hydration so every request can
// carry the current token without callers passing it explicitly.
export function setAuthToken(token: string | null) {
  authToken = token;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  // Gives up after this long and throws a NetworkError. For requests the
  // app would rather queue than wait on - a connection that is "up" but
  // moving no data, or a backend still waking from a cold start.
  timeoutMs?: number;
};

// Thrown for non-2xx responses. `status` and `body` are kept because some
// endpoints (bulk import) return structured, row-level detail in the body
// of a rejection that the caller wants to show rather than a bare message.
export class ApiRequestError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

// Thrown when no response arrived at all. The request may or may not have
// reached the server, which is why the offline queue relies on the order's
// clientRef to make a retry safe. Distinct from ApiRequestError so callers
// can tell "offline, try later" from "the server said no".
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// fetch() rejects with a bare TypeError ("Network request failed") whenever
// no response arrived at all - backend not running, wrong IP, firewall. The
// message says nothing about which, so name the URL and the likely causes.
async function doFetch(url: string, options: RequestInit, timeoutMs?: number) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, controller ? { ...options, signal: controller.signal } : options);
  } catch (err) {
    console.warn(`[api] ${options.method ?? 'GET'} ${url} failed before a response arrived:`, err);
    throw new NetworkError(
      `Could not reach the server at ${url}. Check that the backend is running and that this device can reach it.`
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ||
      `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status, data);
  }
  return data;
}

async function request(path: string, { method = 'GET', body, headers, timeoutMs }: RequestOptions = {}) {
  const response = await doFetch(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    timeoutMs
  );

  return parseResponse(response);
}

// Uploads a multipart form (a spreadsheet, currently). The body must NOT be
// JSON-stringified and no Content-Type is set by hand: both Expo's fetch
// (native) and the browser derive `multipart/form-data; boundary=…` from
// the FormData themselves, and Expo's overrides a caller-supplied value
// anyway.
async function postForm(path: string, formData: FormData) {
  const response = await doFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: formData,
  });

  return parseResponse(response);
}

const apiClient = {
  get: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'GET' }),
  post: (path: string, body?: unknown, options?: RequestOptions) =>
    request(path, { ...options, method: 'POST', body }),
  put: (path: string, body?: unknown, options?: RequestOptions) =>
    request(path, { ...options, method: 'PUT', body }),
  delete: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'DELETE' }),
  postForm,
};

export default apiClient;
