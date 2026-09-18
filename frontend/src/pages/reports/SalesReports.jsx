import { useCallback, useEffect, useState } from 'react';
import { getReport } from '../../api/reports.js';
import { formatMoney } from '../orders/orderCalc.js';

const PAGE_SIZE = 50;

// The reports PROJECT_SPEC.md §18 requires plus company-wise, as tabs. Each one declares
// its own columns; everything else on this page — the date range, the
// summary strip, paging, the loading/empty/error states — is shared, so a
// tab is just a table definition.
const TABS = [
  {
    id: 'daily',
    label: 'Daily',
    empty: 'No sales in this period.',
    columns: [
      { key: 'period', header: 'Date' },
      { key: 'orders', header: 'Valid Orders', numeric: true },
      { key: 'sales', header: 'Sales', numeric: true, money: true },
    ],
  },
  {
    id: 'monthly',
    label: 'Monthly',
    empty: 'No sales in this period.',
    columns: [
      { key: 'period', header: 'Month', render: (row) => formatMonth(row) },
      { key: 'orders', header: 'Valid Orders', numeric: true },
      { key: 'sales', header: 'Sales', numeric: true, money: true },
    ],
  },
  {
    id: 'customer',
    label: 'Customer-wise',
    empty: 'No customer had sales in this period.',
    columns: [
      {
        key: 'customerName',
        header: 'Customer',
        render: (row) => (
          <>
            <div>{row.customerName}</div>
            <div className="muted">{row.customerCode}</div>
          </>
        ),
      },
      { key: 'orders', header: 'Orders', numeric: true },
      { key: 'sales', header: 'Sales', numeric: true, money: true },
    ],
  },
  {
    id: 'product',
    label: 'Product-wise',
    empty: 'No product sold in this period.',
    columns: [
      {
        key: 'productName',
        header: 'Product',
        render: (row) => (
          <>
            <div>{row.productName}</div>
            <div className="muted">{row.productCode}</div>
          </>
        ),
      },
      { key: 'paidQty', header: 'Paid Qty Sold', numeric: true },
      {
        key: 'bonusQty',
        header: 'Bonus Qty',
        numeric: true,
        // Shown as a quantity and never as money: bonus units are free
        // (PROJECT_SPEC.md §9), so they contribute nothing to the Sales
        // column beside them.
        render: (row) => (row.bonusQty > 0 ? <span className="bonus-badge">+{row.bonusQty}</span> : '—'),
      },
      { key: 'sales', header: 'Sales', numeric: true, money: true },
    ],
  },
  {
    id: 'company',
    label: 'Company-wise',
    empty: 'No company had sales in this period.',
    columns: [
      {
        key: 'company',
        header: 'Company',
        render: (row) => (
          <>
            <div>{row.company ?? 'No company recorded'}</div>
            <div className="muted">
              {row.products} product{row.products === 1 ? '' : 's'}
            </div>
          </>
        ),
      },
      { key: 'orders', header: 'Orders', numeric: true },
      { key: 'paidQty', header: 'Paid Qty Sold', numeric: true },
      {
        key: 'bonusQty',
        header: 'Bonus Qty',
        numeric: true,
        render: (row) => (row.bonusQty > 0 ? <span className="bonus-badge">+{row.bonusQty}</span> : '—'),
      },
      { key: 'sales', header: 'Sales', numeric: true, money: true },
    ],
  },
  {
    id: 'range',
    label: 'Date Range',
    // The date-range report IS the summary for the chosen period, so it has
    // no table of its own — the totals strip above is the whole answer.
    columns: null,
  },
];

const MONTH_NAMES = [
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

function formatMonth(row) {
  return `${MONTH_NAMES[row.month - 1] ?? row.month} ${row.year}`;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString().slice(0, 10);
}

function yearStartIso() {
  return new Date(new Date().getFullYear(), 0, 1, 12).toISOString().slice(0, 10);
}

// Sales Reports (PROJECT_SPEC.md §18).
//
// Every number on this page is computed by the backend from one shared
// definition of a valid sale (§34): submitted orders only — drafts and
// cancelled orders excluded — with bonus quantities worth nothing and line
// discounts already applied. Nothing is recalculated here, so this screen
// cannot drift from the Dashboard or Targets.
export default function SalesReports() {
  const [tabId, setTabId] = useState('daily');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const tab = TABS.find((t) => t.id === tabId);

  const fetchReport = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await getReport({ type: tabId, dateFrom, dateTo, page, limit: PAGE_SIZE });

      if (data.rows.length === 0 && page > data.pagination.totalPages) {
        setPage(data.pagination.totalPages);
        return;
      }

      setReport(data);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [tabId, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function selectTab(id) {
    setTabId(id);
    setPage(1);
  }

  function applyPreset(from, to) {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  }

  const today = todayIso();
  const hasRange = Boolean(dateFrom || dateTo);
  const summary = report?.summary;

  return (
    <div>
      <div className="page-header">
        <h2>Sales Reports</h2>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === tabId}
            className={item.id === tabId ? 'tab is-active' : 'tab'}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <label className="filter-field">
          From
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="filter-field">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="filter-actions">
          <button type="button" className="btn-secondary btn-compact" onClick={() => applyPreset(today, today)}>
            Today
          </button>
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={() => applyPreset(monthStartIso(), today)}
          >
            This Month
          </button>
          <button type="button" className="btn-secondary btn-compact" onClick={() => applyPreset(yearStartIso(), today)}>
            This Year
          </button>
          <button
            type="button"
            className="btn-secondary btn-compact"
            onClick={() => applyPreset('', '')}
            disabled={!hasRange}
          >
            All Time
          </button>
        </div>
      </div>

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load this report: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchReport}>
            Retry
          </button>
        </div>
      )}

      {status !== 'error' && (
        <>
          <div className="summary-strip">
            <div className="summary-tile">
              <span className="summary-tile-label">Valid Orders</span>
              <span className="summary-tile-value">{status === 'loading' ? '…' : summary.orders}</span>
            </div>
            <div className="summary-tile">
              <span className="summary-tile-label">Gross</span>
              <span className="summary-tile-value">{status === 'loading' ? '…' : formatMoney(summary.subtotal)}</span>
            </div>
            <div className="summary-tile">
              <span className="summary-tile-label">Discount</span>
              <span className="summary-tile-value">
                {status === 'loading' ? '…' : `− ${formatMoney(summary.discountTotal)}`}
              </span>
            </div>
            <div className="summary-tile summary-tile-primary">
              <span className="summary-tile-label">Total Sales</span>
              <span className="summary-tile-value">{status === 'loading' ? '…' : formatMoney(summary.sales)}</span>
            </div>
            <div className="summary-tile">
              <span className="summary-tile-label">Paid Qty Sold</span>
              <span className="summary-tile-value">{status === 'loading' ? '…' : summary.paidQty}</span>
            </div>
            <div className="summary-tile">
              <span className="summary-tile-label">Bonus Qty (free)</span>
              <span className="summary-tile-value">{status === 'loading' ? '…' : summary.bonusQty}</span>
            </div>
          </div>

          <p className="picker-note">
            {hasRange
              ? `Covering ${dateFrom || 'the beginning'} to ${dateTo || 'today'}.`
              : 'Covering all time.'}{' '}
            Only submitted orders count — drafts and cancelled orders are excluded. Bonus quantities are free and add
            nothing to sales; line discounts are already deducted.
          </p>

          {status === 'loading' && <div className="page-placeholder">Loading report…</div>}

          {status === 'ready' && tab.columns === null && (
            <div className="page-placeholder">
              {summary.orders === 0
                ? 'No sales in this period.'
                : 'The totals above are the sales for the selected period. Pick another tab to break them down by day, month, customer or product.'}
            </div>
          )}

          {status === 'ready' && tab.columns !== null && report.rows.length === 0 && (
            <div className="page-placeholder">{tab.empty}</div>
          )}

          {status === 'ready' && tab.columns !== null && report.rows.length > 0 && (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {tab.columns.map((column) => (
                        <th key={column.key} className={column.numeric ? 'numeric' : undefined}>
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr key={row.customerId ?? row.productId ?? row.period ?? row.company ?? index}>
                        {tab.columns.map((column) => (
                          <td
                            key={column.key}
                            className={
                              column.money ? 'numeric line-total' : column.numeric ? 'numeric' : undefined
                            }
                          >
                            {column.render
                              ? column.render(row)
                              : column.money
                                ? formatMoney(row[column.key])
                                : row[column.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.pagination.totalPages > 1 && (
                <div className="pagination">
                  <span>
                    Showing {(report.pagination.page - 1) * report.pagination.limit + 1}–
                    {Math.min(report.pagination.page * report.pagination.limit, report.pagination.total)} of{' '}
                    {report.pagination.total}
                  </span>
                  <div className="pagination-controls">
                    <button type="button" disabled={report.pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </button>
                    <span>
                      Page {report.pagination.page} of {report.pagination.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={report.pagination.page >= report.pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
