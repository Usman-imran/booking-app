import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client.js';
import OrderStatusBadge from './orders/OrderStatusBadge.jsx';
import { formatMoney } from './orders/orderCalc.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const STATUS_LABELS = {
  achieved: 'Achieved',
  'in-progress': 'In Progress',
  'not-started': 'Not Started',
  'no-target': 'No Target Set',
};

// PROJECT_SPEC.md §3 Quick Actions, in the order the spec lists them.
const QUICK_ACTIONS = [
  { to: '/orders/new', label: 'Create Order', primary: true },
  { to: '/customers', label: 'Customers' },
  { to: '/products', label: 'Products' },
  { to: '/orders', label: 'Orders' },
];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatTile({ label, value, hint, to, primary }) {
  const content = (
    <>
      <span className="summary-tile-label">{label}</span>
      <span className="summary-tile-value">{value}</span>
      {hint && <span className="summary-tile-hint">{hint}</span>}
    </>
  );

  const className = primary ? 'summary-tile summary-tile-primary' : 'summary-tile';
  return to ? (
    <Link to={to} className={`${className} summary-tile-link`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// The operational overview of PROJECT_SPEC.md §3.
//
// Every figure comes from GET /api/dashboard, which assembles them from the
// same modules that back Sales Reports and Targets (§34) — so this screen
// cannot drift from those. Nothing here recalculates sales: drafts and
// cancelled orders are already excluded, bonus quantities already contribute
// nothing, and line discounts are already deducted before the numbers
// arrive.
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await apiClient.get('/dashboard');
      setData(result);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const monthLabel = data ? `${MONTHS[data.month - 1]} ${data.year}` : '';
  const target = data?.target;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <div className="header-actions">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.to} to={action.to} className={action.primary ? 'btn-primary' : 'btn-secondary'}>
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {status === 'loading' && <div className="page-placeholder">Loading dashboard…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load the dashboard: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchDashboard}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="summary-strip">
            <StatTile label="Today's Orders" value={data.today.orders} />
            <StatTile label="Today's Sales" value={formatMoney(data.today.sales)} primary />
            <StatTile label={`${MONTHS[data.month - 1]} Orders`} value={data.monthly.orders} />
            <StatTile label={`${MONTHS[data.month - 1]} Sales`} value={formatMoney(data.monthly.sales)} primary />
            <StatTile
              label="Draft Orders"
              value={data.draftOrders}
              hint={data.draftOrders > 0 ? 'Waiting to be submitted' : 'Nothing pending'}
              to="/orders/drafts"
            />
          </div>

          <section className="section-card">
            <h3 className="form-section-title">
              Monthly Target — {monthLabel}
              <span className={`status-badge status-target-${target.status}`}>
                {STATUS_LABELS[target.status] ?? target.status}
              </span>
            </h3>

            {target.targetAmount > 0 ? (
              <>
                <div className="target-card-figure">
                  {/* A zero target makes the percentage undefined rather than
                      infinite (PROJECT_SPEC.md §19); that case is handled by
                      the branch below, so this one always has a number. */}
                  {formatMoney(target.achievementPercent)}%
                </div>
                <div className="progress-track" role="progressbar" aria-valuenow={Math.round(target.achievementPercent)} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className={`progress-fill progress-fill-${target.status}`}
                    style={{ width: `${Math.min(target.achievementPercent, 100)}%` }}
                  />
                </div>

                <dl className="summary-list target-card-list">
                  <div className="summary-row">
                    <dt>Target</dt>
                    <dd>{formatMoney(target.targetAmount)}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Achieved</dt>
                    <dd>{formatMoney(target.achieved)}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>{target.remaining < 0 ? 'Exceeded By' : 'Remaining'}</dt>
                    <dd className={target.remaining < 0 ? 'target-exceeded' : undefined}>
                      {formatMoney(Math.abs(target.remaining))}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="picker-message">
                No target set for {monthLabel}. {formatMoney(target.achieved)} has been achieved so far.{' '}
                <Link to="/targets">Set a target</Link> to track progress against it.
              </div>
            )}
          </section>

          <section className="section-card">
            <h3 className="form-section-title">Recent Orders</h3>

            {data.recentOrders.length === 0 ? (
              <div className="picker-message">
                No orders yet. <Link to="/orders/new">Create the first order</Link> to get started.
              </div>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th className="numeric">Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => {
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
                            <td className={isCancelled ? 'numeric value-void' : 'numeric'}>
                              {formatMoney(order.total)}
                            </td>
                            <td>
                              <OrderStatusBadge status={order.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="picker-note">
                  <Link to="/orders">View all orders</Link> — cancelled orders are shown here for context but count
                  towards no sales figure above.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
