import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelOrder, listOrders } from '../../api/orders.js';
import { listBookers } from '../../api/users.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import CustomerPicker from './CustomerPicker.jsx';
import OrderStatusBadge from './OrderStatusBadge.jsx';
import { formatMoney } from './orderCalc.js';

const PAGE_SIZE = 20;

// The Orders module shows submitted orders and their statuses
// (PROJECT_SPEC.md §17). Drafts are not orders yet and live on their own
// page, so they are never included here — "All" means submitted + cancelled.
const ALL_STATUSES = 'submitted,cancelled';

const EMPTY_FILTERS = {
  status: ALL_STATUSES,
  customer: null,
  bookerId: '',
  dateFrom: '',
  dateTo: '',
};

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderList() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [bookers, setBookers] = useState([]);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Loaded once — the Booker filter needs names, not ids. A failure here
  // only costs that one filter, so it must not take the page down with it.
  useEffect(() => {
    let cancelled = false;
    listBookers()
      .then((data) => {
        if (!cancelled) setBookers(data.users);
      })
      .catch(() => {
        if (!cancelled) setBookers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchOrders = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listOrders({
        page,
        limit: PAGE_SIZE,
        search,
        status: filters.status,
        customerId: filters.customer?.id,
        bookerId: filters.bookerId || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });

      // Cancelling under a status filter can empty the current page; snap
      // back rather than stranding the list past its last page.
      if (data.orders.length === 0 && page > data.pagination.totalPages) {
        setPage(data.pagination.totalPages);
        return;
      }

      setOrders(data.orders);
      setPagination(data.pagination);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [page, search, filters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }

  function showToday() {
    const today = todayIso();
    updateFilter({ dateFrom: today, dateTo: today });
  }

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  async function confirmCancel() {
    if (!confirmTarget) return;
    setIsMutating(true);
    setActionError(null);
    try {
      const data = await cancelOrder(confirmTarget.id);
      setSuccess(`Order ${data.order.orderNumber} cancelled. It stays on record but no longer counts towards sales.`);
      setConfirmTarget(null);
      await fetchOrders();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  const today = todayIso();
  const isTodayFilter = filters.dateFrom === today && filters.dateTo === today;
  const hasFilters =
    Boolean(search) ||
    filters.status !== ALL_STATUSES ||
    Boolean(filters.customer) ||
    Boolean(filters.bookerId) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo);

  return (
    <div>
      <div className="page-header">
        <h2>Orders</h2>
        <div className="header-actions">
          <Link to="/orders/drafts" className="btn-secondary">
            Draft Orders
          </Link>
          <Link to="/orders/new" className="btn-primary">
            Create Order
          </Link>
        </div>
      </div>

      {success && (
        <div className="banner-success" role="status">
          {success}
          <button type="button" className="link-button" onClick={() => setSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="banner-error" role="alert">
          {actionError}
        </div>
      )}

      <div className="filters">
        <label className="filter-field filter-field-wide">
          Search
          <input
            type="text"
            placeholder="Order number, customer name or code…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label className="filter-field">
          Status
          <select value={filters.status} onChange={(event) => updateFilter({ status: event.target.value })}>
            <option value={ALL_STATUSES}>All orders</option>
            <option value="submitted">Submitted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label className="filter-field">
          Booker
          <select value={filters.bookerId} onChange={(event) => updateFilter({ bookerId: event.target.value })}>
            <option value="">All bookers</option>
            {bookers.map((booker) => (
              <option key={booker.id} value={booker.id}>
                {booker.name}
                {booker.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          From
          <input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(event) => updateFilter({ dateFrom: event.target.value })}
          />
        </label>

        <label className="filter-field">
          To
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(event) => updateFilter({ dateTo: event.target.value })}
          />
        </label>

        <div className="filter-field filter-field-wide">
          <span className="filter-label">Customer</span>
          <CustomerPicker value={filters.customer} onChange={(customer) => updateFilter({ customer })} />
        </div>

        <div className="filter-actions">
          <button
            type="button"
            className={isTodayFilter ? 'btn-secondary btn-compact is-active' : 'btn-secondary btn-compact'}
            onClick={showToday}
          >
            Today&apos;s Orders
          </button>
          <button type="button" className="btn-secondary btn-compact" onClick={clearFilters} disabled={!hasFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {status === 'loading' && <div className="page-placeholder">Loading orders…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load orders: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchOrders}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && orders.length === 0 && (
        <div className="page-placeholder">
          {hasFilters
            ? 'No order matches these filters.'
            : 'No orders yet. Orders you submit from Create Order appear here.'}
        </div>
      )}

      {status === 'ready' && orders.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Booker</th>
                  <th className="numeric">Items</th>
                  <th className="numeric">Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isCancelled = order.status === 'cancelled';
                  return (
                    <tr key={order.id} className={isCancelled ? 'row-cancelled' : undefined}>
                      <td>
                        <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link>
                      </td>
                      <td>{formatDateTime(order.submittedAt)}</td>
                      <td>
                        {order.customer.name}
                        <div className="muted">{order.customer.code}</div>
                      </td>
                      <td>{order.booker.name}</td>
                      <td className="numeric">{order.itemCount}</td>
                      <td className={isCancelled ? 'numeric value-void' : 'numeric'}>{formatMoney(order.total)}</td>
                      <td>
                        <OrderStatusBadge status={order.status} />
                        {isCancelled && order.cancelledByName && (
                          <div className="muted">by {order.cancelledByName}</div>
                        )}
                      </td>
                      <td className="row-actions">
                        <Link to={`/orders/${order.id}`}>View</Link>
                        {/* Cancelling is the only change a submitted order
                            allows (PROJECT_SPEC.md §14) — there is
                            deliberately no Edit action here. */}
                        {order.status === 'submitted' && (
                          <button type="button" onClick={() => setConfirmTarget(order)}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span>
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="pagination-controls">
              <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Cancel this order?"
        message={
          confirmTarget
            ? `Order ${confirmTarget.orderNumber} for ${confirmTarget.customer.name}, grand total ${formatMoney(
                confirmTarget.total
              )}. The order is kept on record in full — nothing is deleted — but it will be excluded from all sales figures and targets. This cannot be undone.`
            : ''
        }
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        isLoading={isMutating}
        onConfirm={confirmCancel}
        onCancel={() => {
          setConfirmTarget(null);
          setActionError(null);
        }}
      />
    </div>
  );
}
