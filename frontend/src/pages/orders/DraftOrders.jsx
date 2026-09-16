import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteDraftOrder, listOrders, submitDraftOrder } from '../../api/orders.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatMoney } from './orderCalc.js';

const PAGE_SIZE = 20;

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Draft Orders (PROJECT_SPEC.md §13): the orders a booker saved to finish
// later. Drafts are not sales — they carry no order number and count
// towards nothing until they are submitted.
//
// Every action §13 asks for is here: view, open/continue, delete, and
// submit.
export default function DraftOrders() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [drafts, setDrafts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // { draft, action: 'submit' | 'delete' }
  const [confirm, setConfirm] = useState(null);
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

  const fetchDrafts = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listOrders({ page, limit: PAGE_SIZE, search, status: 'draft' });

      // Submitting or deleting the last row on a page can leave `page`
      // pointing past the end. Snap back rather than showing an empty
      // "no results" state with no way out — same as the other lists.
      if (data.orders.length === 0 && page > data.pagination.totalPages) {
        setPage(data.pagination.totalPages);
        return;
      }

      setDrafts(data.orders);
      setPagination(data.pagination);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [page, search]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  async function runConfirmedAction() {
    if (!confirm) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (confirm.action === 'submit') {
        const data = await submitDraftOrder(confirm.draft.id);
        setSuccess(`Order ${data.order.orderNumber} submitted — grand total ${formatMoney(data.order.total)}.`);
      } else {
        await deleteDraftOrder(confirm.draft.id);
        setSuccess('Draft deleted.');
      }
      setConfirm(null);
      await fetchDrafts();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  const confirmCopy =
    confirm?.action === 'submit'
      ? {
          title: 'Submit this draft?',
          message: `${confirm.draft.customer.name} — ${confirm.draft.itemCount} item${
            confirm.draft.itemCount === 1 ? '' : 's'
          }, grand total ${formatMoney(confirm.draft.total)}. It will be submitted exactly as saved and given an order number. Submitted orders cannot be edited afterwards, only cancelled.`,
          confirmLabel: 'Submit Order',
        }
      : {
          title: 'Delete this draft?',
          message: `The draft for ${confirm?.draft.customer.name} and all of its items will be permanently deleted. This cannot be undone.`,
          confirmLabel: 'Delete Draft',
        };

  return (
    <div>
      <div className="page-header">
        <h2>Draft Orders</h2>
        <Link to="/orders/new" className="btn-primary">
          Create Order
        </Link>
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

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search drafts by customer name or code…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      {status === 'loading' && <div className="page-placeholder">Loading drafts…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load drafts: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchDrafts}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && drafts.length === 0 && (
        <div className="page-placeholder">
          {search
            ? 'No draft matches your search.'
            : 'No draft orders. Drafts you save from Create Order appear here, ready to finish later.'}
        </div>
      )}

      {status === 'ready' && drafts.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Saved</th>
                  <th>Customer</th>
                  <th className="numeric">Items</th>
                  <th className="numeric">Total</th>
                  <th>Remarks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>{formatDateTime(draft.createdAt)}</td>
                    <td>
                      <Link to={`/orders/${draft.id}`}>{draft.customer.name}</Link>
                      <div className="muted">{draft.customer.code}</div>
                    </td>
                    <td className="numeric">{draft.itemCount}</td>
                    <td className="numeric">{formatMoney(draft.total)}</td>
                    <td className="cell-truncate" title={draft.remarks || ''}>
                      {draft.remarks || '—'}
                    </td>
                    <td className="row-actions">
                      <Link to={`/orders/${draft.id}`}>View</Link>
                      <Link to={`/orders/drafts/${draft.id}/edit`}>Continue</Link>
                      <button
                        type="button"
                        className="row-action-primary"
                        // An empty draft can't be submitted (PROJECT_SPEC.md
                        // §26) — say so here rather than after a failed request.
                        disabled={draft.itemCount === 0}
                        title={draft.itemCount === 0 ? 'Add at least one product before submitting.' : undefined}
                        onClick={() => setConfirm({ draft, action: 'submit' })}
                      >
                        Submit
                      </button>
                      <button type="button" onClick={() => setConfirm({ draft, action: 'delete' })}>
                        Delete
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
        open={Boolean(confirm)}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        confirmVariant={confirm?.action === 'submit' ? 'primary' : 'danger'}
        isLoading={isMutating}
        onConfirm={runConfirmedAction}
        onCancel={() => {
          setConfirm(null);
          setActionError(null);
        }}
      />

      {/* Keeps the "Continue" link honest if a draft was submitted elsewhere. */}
      {status === 'ready' && drafts.length > 0 && (
        <p className="picker-note">
          Submitting sends the draft exactly as saved. Choose <strong>Continue</strong> instead to re-open it in Create
          Order, where every line is re-priced at today&apos;s prices before you submit.
        </p>
      )}
    </div>
  );
}
