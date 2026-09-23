import { NetworkError } from '../api/client';
import { listCustomers, type Customer } from '../api/customers';
import type { DashboardData } from '../api/dashboard';
import type { ListOrdersParams, OrderSummary, Pagination } from '../api/orders';
import { listProducts, type Product } from '../api/products';
import { isOnline } from './network';
import { readJson, userKey, writeJson } from './storage';

// Local copies of what an order needs when the server can't be reached:
// the active catalogue and customer list (downloaded whole, in the
// background) and the first page of each Orders filter (saved as viewed).

const PAGE_SIZE = 100; // the API's maximum
// A refresh is skipped when the last one is newer than this, so reconnect
// flapping on a weak signal doesn't re-download the catalogue every time.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

type Cached<T> = { fetchedAt: number; rows: T[] };

let userId: number | null = null;
// Held in memory once read: the pickers search on every keystroke.
let products: Cached<Product> | null = null;
let customers: Cached<Customer> | null = null;
let refreshing: Promise<void> | null = null;

export async function loadCache(nextUserId: number | null) {
  userId = nextUserId;
  products = null;
  customers = null;
  if (nextUserId === null) return;
  const [storedProducts, storedCustomers] = await Promise.all([
    readJson<Cached<Product>>(userKey(nextUserId, 'products')),
    readJson<Cached<Customer>>(userKey(nextUserId, 'customers')),
  ]);
  if (userId !== nextUserId) return;
  products = storedProducts;
  customers = storedCustomers;
}

async function fetchAll<T>(fetchPage: (page: number) => Promise<{ rows: T[]; pagination: Pagination }>) {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await fetchPage(page);
    rows.push(...result.rows);
    if (page >= result.pagination.totalPages) return rows;
  }
}

// Downloads every active product and customer. Safe to call often: it is
// throttled, and concurrent calls share one run. A failure leaves the
// previous copy in place.
export function refreshCache({ force = false }: { force?: boolean } = {}) {
  if (refreshing) return refreshing;
  const forUser = userId;
  if (forUser === null) return Promise.resolve();
  const stale = (cached: Cached<unknown> | null) => force || !cached || Date.now() - cached.fetchedAt > REFRESH_INTERVAL_MS;
  if (!stale(products) && !stale(customers)) return Promise.resolve();

  refreshing = (async () => {
    try {
      const fetchedAt = Date.now();
      const [productRows, customerRows] = await Promise.all([
        fetchAll((page) =>
          listProducts({ isActive: true, limit: PAGE_SIZE, page }).then((r) => ({ rows: r.products, pagination: r.pagination }))
        ),
        fetchAll((page) =>
          listCustomers({ isActive: true, limit: PAGE_SIZE, page }).then((r) => ({ rows: r.customers, pagination: r.pagination }))
        ),
      ]);
      if (userId !== forUser) return;
      products = { fetchedAt, rows: productRows };
      customers = { fetchedAt, rows: customerRows };
      await Promise.all([
        writeJson(userKey(forUser, 'products'), products),
        writeJson(userKey(forUser, 'customers'), customers),
      ]);
    } catch (err) {
      console.warn('[offline] catalogue refresh failed; keeping the previous copy:', err);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const contains = (value: string | null | undefined, needle: string) =>
  Boolean(value && value.toLowerCase().includes(needle));

// The same fields the server's ILIKE search covers (models/product.js,
// models/customer.js), so results don't change meaning offline. null when
// nothing has been downloaded yet - "no copy" is not "no matches".
export function searchCachedProducts({ search, company, limit }: { search?: string; company?: string; limit: number }) {
  if (!products) return null;
  const needle = search?.trim().toLowerCase() ?? '';
  const companyKey = company?.toLowerCase();
  return products.rows
    .filter((p) => !needle || contains(p.name, needle) || contains(p.code, needle) || contains(p.company, needle))
    .filter((p) => !companyKey || p.company?.toLowerCase() === companyKey)
    .slice(0, limit);
}

export function searchCachedCustomers({ search, limit }: { search?: string; limit: number }) {
  if (!customers) return null;
  const needle = search?.trim().toLowerCase() ?? '';
  return customers.rows.filter((c) => !needle || contains(c.name, needle) || contains(c.code, needle)).slice(0, limit);
}

export function cachedCompanies() {
  const names = new Set((products?.rows ?? []).map((p) => p.company).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b));
}

// --- Orders list ------------------------------------------------------

type OrdersPage = { orders: OrderSummary[]; pagination: Pagination };

function ordersKey(forUser: number, status: ListOrdersParams['status']) {
  const filter = !status ? 'all' : Array.isArray(status) ? status.join(',') : status;
  return userKey(forUser, `orders.${filter}`);
}

// Saves an unsearched first page as it is viewed, so the Orders tab still
// has something to show offline.
export async function saveOrdersPage(status: ListOrdersParams['status'], page: OrdersPage) {
  if (userId === null) return;
  await writeJson(ordersKey(userId, status), page).catch(() => {});
}

// The saved first page, narrowed locally when there is a search.
export async function readOrdersPage(status: ListOrdersParams['status'], search?: string): Promise<OrdersPage | null> {
  if (userId === null) return null;
  const page = await readJson<OrdersPage>(ordersKey(userId, status));
  if (!page || !search) return page;
  const needle = search.toLowerCase();
  const orders = page.orders.filter(
    (o) => contains(o.orderNumber, needle) || contains(o.customer?.name, needle) || contains(o.customer?.code, needle)
  );
  return { orders, pagination: { ...page.pagination, page: 1, total: orders.length, totalPages: 1 } };
}

// --- Dashboard ----------------------------------------------------------

// The last dashboard the server returned, stamped with when, so Home can
// show real (if dated) figures with no signal instead of an error.
export type CachedDashboard = { fetchedAt: number; data: DashboardData };

export async function saveDashboard(data: DashboardData) {
  if (userId === null) return;
  await writeJson(userKey(userId, 'dashboard'), { fetchedAt: Date.now(), data } satisfies CachedDashboard).catch(() => {});
}

export async function readDashboard(): Promise<CachedDashboard | null> {
  if (userId === null) return null;
  return readJson<CachedDashboard>(userKey(userId, 'dashboard'));
}

// --- Fallback -----------------------------------------------------------

// Runs the online request, and answers from the local copy instead when
// the device is known to be offline or the request gets no response. A
// server error (4xx/5xx) is NOT covered: that's a real answer, not a
// connectivity problem, and is rethrown. So is a miss in the local copy.
export async function withOfflineFallback<T>(
  online: () => Promise<T>,
  offline: () => T | null | Promise<T | null>
): Promise<{ data: T; fromCache: boolean }> {
  if (isOnline()) {
    try {
      return { data: await online(), fromCache: false };
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      const cached = await offline();
      if (cached === null) throw err;
      return { data: cached, fromCache: true };
    }
  }
  const cached = await offline();
  if (cached === null) throw new NetworkError('You are offline and nothing is saved on this device for this yet.');
  return { data: cached, fromCache: true };
}
