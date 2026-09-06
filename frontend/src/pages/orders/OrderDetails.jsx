import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cancelOrder, deleteDraftOrder, getOrder, submitDraftOrder } from '../../api/orders.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatScheme } from '../products/schemeFormat.js';
import { formatMoney } from './orderCalc.js';
import OrderStatusBadge from './OrderStatusBadge.jsx';
import OrderReceiptModal from '../../components/orders/OrderReceiptModal.jsx';

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

// One order, in full (PROJECT_SPEC.md §17: Order Details). This is the only
// detail view in the app — it renders whichever status the order is
// actually in and offers only the actions that status allows, so a link
// never leads anywhere misleading:
//
//   draft      → Continue Editing, Submit Order, Delete Draft
//   submitted  → Cancel Order, and nothing else (PROJECT_SPEC.md §14)
//   cancelled  → read-only, showing who cancelled it and when
export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'submit' | 'delete' | 'cancel'
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchOrder = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await getOrder(id);
      setOrder(data.order);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  async function runConfirmedAction() {
    setIsMutating(true);
    setActionError(null);
    try {
      if (confirmAction === 'submit') {
        const data = await submitDraftOrder(id);
        setOrder(data.order);
        setSuccess(`Order ${data.order.orderNumber} submitted. It is now permanent and can no longer be edited.`);
      } else if (confirmAction === 'cancel') {
        const data = await cancelOrder(id);
        setOrder(data.order);
        setSuccess('Order cancelled. It stays on record but no longer counts towards any sales figures.');
      } else {
        await deleteDraftOrder(id);
        navigate('/orders/drafts', { replace: true });
        return;
      }
      setConfirmAction(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  if (status === 'loading') {
    return <div className="page-placeholder">Loading order…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-placeholder">
        <p>Could not load this order: {error}</p>
        <div className="form-actions">
          <Link to="/orders" className="btn-secondary">
            Back to Orders
          </Link>
          <button type="button" className="btn-primary" onClick={fetchOrder}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isDraft = order.status === 'draft';
  const isSubmitted = order.status === 'submitted';
  const isCancelled = order.status === 'cancelled';
  const isEmpty = order.items.length === 0;
  const backTo = isDraft ? '/orders/drafts' : '/orders';

  const totalPaidQty = order.items.reduce((sum, item) => sum + item.paidQty, 0);
  const totalBonusQty = order.items.reduce((sum, item) => sum + item.bonusQty, 0);

  const confirmCopy = {
    submit: {
      title: 'Submit this draft?',
      message: `${order.customer.name} — ${order.items.length} item${
        order.items.length === 1 ? '' : 's'
      }, grand total ${formatMoney(
        order.total
      )}. It will be submitted exactly as saved and given an order number. Submitted orders cannot be edited afterwards, only cancelled.`,
      confirmLabel: 'Submit Order',
      variant: 'primary',
    },
    cancel: {
      title: 'Cancel this order?',
      message: `Order ${order.orderNumber} for ${order.customer.name}, grand total ${formatMoney(
        order.total
      )}. The order is kept on record in full — nothing is deleted — but it will be excluded from all sales figures and targets. This cannot be undone.`,
      confirmLabel: 'Cancel Order',
      variant: 'danger',
    },
    delete: {
      title: 'Delete this draft?',
      message: 'This draft and all of its items will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete Draft',
      variant: 'danger',
    },
  }[confirmAction] ?? {};

  return (
    <div>
      <div className="page-header">
        <h2>
          {order.orderNumber || 'Draft Order'}
          <OrderStatusBadge status={order.status} />
        </h2>
        <div className="header-actions">
          <Link to={backTo} className="btn-secondary">
            {isDraft ? 'Back to Drafts' : 'Back to Orders'}
          </Link>
          {isDraft && (
            <>
              <Link to={`/orders/drafts/${order.id}/edit`} className="btn-secondary">
                Continue Editing
              </Link>
              <button
                type="button"
                className="btn-primary"
                disabled={isEmpty}
                title={isEmpty ? 'Add at least one product before submitting.' : undefined}
                onClick={() => setConfirmAction('submit')}
              >
                Submit Order
              </button>
            </>
          )}
          {isSubmitted && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setIsReceiptOpen(true)}>
                Share / Export
              </button>
              <button type="button" className="btn-danger" onClick={() => setConfirmAction('cancel')}>
                Cancel Order
              </button>
            </>
          )}
        </div>
      </div>

      {success && (
        <div className="banner-success" role="status">
          {success}
        </div>
      )}

      {actionError && (
        <div className="banner-error" role="alert">
          {actionError}
        </div>
      )}

      {isDraft && (
        <div className="banner-info">
          This is a draft. It has no order number and counts towards no sales figures until it is submitted.
        </div>
      )}

      {isSubmitted && (
        <div className="banner-info">
          This order is submitted and locked — its products, quantities, prices, discounts and bonuses can no longer be
          changed. To correct a mistake, cancel it and create a new order.
        </div>
      )}

      {isCancelled && (
        <div className="banner-cancelled" role="status">
          <strong>This order was cancelled</strong> on {formatDateTime(order.cancelledAt)}
          {order.cancelledByName ? ` by ${order.cancelledByName}` : ''}. It is kept on record in full, and is excluded
          from all sales reports, dashboard figures and target achievement.
        </div>
      )}

      <div className="detail-card detail-card-wide">
        <dl className="detail-grid">
          <div>
            <dt>Customer</dt>
            <dd>
              {order.customer.name} <span className="muted">({order.customer.code})</span>
            </dd>
          </div>
          <div>
            <dt>Booker</dt>
            <dd>{order.booker.name}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{order.customer.phone || '—'}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{order.customer.cityArea || '—'}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDateTime(order.submittedAt)}</dd>
          </div>
          {isCancelled && (
            <>
              <div>
                <dt>Cancelled</dt>
                <dd>{formatDateTime(order.cancelledAt)}</dd>
              </div>
              <div>
                <dt>Cancelled By</dt>
                <dd>{order.cancelledByName || '—'}</dd>
              </div>
            </>
          )}
          <div className="detail-grid-full">
            <dt>Remarks</dt>
            <dd>{order.remarks || '—'}</dd>
          </div>
        </dl>
      </div>

      {isEmpty ? (
        <div className="page-placeholder">
          This draft has no products yet. Choose <strong>Continue Editing</strong> to add some — an order needs at least
          one product before it can be submitted.
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="numeric">Rate</th>
                  <th className="numeric">Paid Qty</th>
                  <th>Scheme</th>
                  <th className="numeric">Bonus Qty</th>
                  <th className="numeric">Subtotal</th>
                  <th className="numeric">Discount</th>
                  <th className="numeric">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>{item.productName}</div>
                      <div className="muted">{item.productCode}</div>
                    </td>
                    <td className="numeric">{formatMoney(item.rate)}</td>
                    <td className="numeric">{item.paidQty}</td>
                    <td>
                      {formatScheme({
                        schemeEnabled: item.schemePurchaseQty !== null,
                        schemePurchaseQty: item.schemePurchaseQty,
                        schemeBonusQty: item.schemeBonusQty,
                      })}
                    </td>
                    <td className="numeric">
                      {item.bonusQty > 0 ? <span className="bonus-badge">+{item.bonusQty}</span> : '—'}
                    </td>
                    <td className="numeric">{formatMoney(item.lineSubtotal)}</td>
                    <td className="numeric">
                      {item.discount > 0 ? (
                        <>
                          {formatMoney(item.lineDiscount)} <span className="muted">({formatMoney(item.discount)}%)</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="numeric line-total">{formatMoney(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="detail-card detail-card-totals">
            <dl className="summary-list">
              <div className="summary-row">
                <dt>Total Items</dt>
                <dd>{order.items.length}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Paid Qty</dt>
                <dd>{totalPaidQty}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Bonus Qty</dt>
                <dd>{totalBonusQty > 0 ? <span className="bonus-badge">+{totalBonusQty}</span> : 0}</dd>
              </div>
              <div className="summary-row">
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotal)}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Discount</dt>
                <dd>{order.discountTotal > 0 ? `− ${formatMoney(order.discountTotal)}` : formatMoney(0)}</dd>
              </div>
              <div className="summary-row summary-grand-total">
                <dt>Grand Total</dt>
                <dd className={isCancelled ? 'value-void' : undefined}>{formatMoney(order.total)}</dd>
              </div>
            </dl>
            {isCancelled && <p className="summary-note">Cancelled — this total counts towards no sales figure.</p>}
          </div>
        </>
      )}

      {isDraft && (
        <div className="form-actions">
          <button type="button" className="btn-danger" onClick={() => setConfirmAction('delete')}>
            Delete Draft
          </button>
        </div>
      )}

      <OrderReceiptModal open={isReceiptOpen} order={order} onClose={() => setIsReceiptOpen(false)} />

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        confirmVariant={confirmCopy.variant}
        isLoading={isMutating}
        onConfirm={runConfirmedAction}
        onCancel={() => {
          setConfirmAction(null);
          setActionError(null);
        }}
      />
    </div>
  );
}
