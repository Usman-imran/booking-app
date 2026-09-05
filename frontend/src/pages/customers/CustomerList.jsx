import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deactivateCustomer, listCustomers, updateCustomer } from '../../api/customers.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const PAGE_SIZE = 20;

export default function CustomerList() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Debounce free-text search so we don't fire a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCustomers = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listCustomers({ page, limit: PAGE_SIZE, search, isActive: statusFilter || undefined });

      // A mutation (e.g. deactivating the last row on this page) or a
      // filter change can leave `page` pointing past the new last page.
      // Snap back instead of showing a misleading "no results" state
      // with no pagination controls to escape it.
      if (data.customers.length === 0 && page > data.pagination.totalPages) {
        setPage(data.pagination.totalPages);
        return;
      }

      setCustomers(data.customers);
      setPagination(data.pagination);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function handleFilterChange(event) {
    setStatusFilter(event.target.value);
    setPage(1);
  }

  async function confirmToggleStatus() {
    if (!confirmTarget) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (confirmTarget.isActive) {
        await deactivateCustomer(confirmTarget.id);
      } else {
        await updateCustomer(confirmTarget.id, { isActive: true });
      }
      setConfirmTarget(null);
      await fetchCustomers();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  const hasFilters = Boolean(search || statusFilter);

  return (
    <div>
      <div className="page-header">
        <h2>Customers</h2>
        <Link to="/customers/new" className="btn-primary">
          Add Customer
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search by name or code…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select value={statusFilter} onChange={handleFilterChange}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {actionError && (
        <div className="banner-error" role="alert">
          {actionError}
        </div>
      )}

      {status === 'loading' && <div className="page-placeholder">Loading customers…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load customers: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchCustomers}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && customers.length === 0 && (
        <div className="page-placeholder">
          {hasFilters ? 'No customers match your search/filter.' : 'No customers yet. Add your first customer to get started.'}
        </div>
      )}

      {status === 'ready' && customers.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>City/Area</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                    </td>
                    <td>{customer.code}</td>
                    <td>{customer.contactPerson || '—'}</td>
                    <td>{customer.phone || '—'}</td>
                    <td>{customer.cityArea || '—'}</td>
                    <td>{customer.customerType || '—'}</td>
                    <td>
                      <span className={`status-badge ${customer.isActive ? 'status-active' : 'status-inactive'}`}>
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <Link to={`/customers/${customer.id}/edit`}>Edit</Link>
                      <button type="button" onClick={() => setConfirmTarget(customer)}>
                        {customer.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
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
        title={confirmTarget?.isActive ? 'Deactivate customer?' : 'Reactivate customer?'}
        message={
          confirmTarget?.isActive
            ? `${confirmTarget?.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
            : `${confirmTarget?.name} will be marked active again.`
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate' : 'Reactivate'}
        isLoading={isMutating}
        onConfirm={confirmToggleStatus}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
