import { useCallback, useEffect, useState } from 'react';
import { deleteTarget, getTargets, setTarget } from '../../api/targets.js';
import { listProductCompanies } from '../../api/products.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatMoney } from '../orders/orderCalc.js';

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

// Status is decided by the backend so the Targets page and the Dashboard
// can't label the same month differently; this only gives each value a
// label and a colour.
const STATUS_LABELS = {
  achieved: 'Achieved',
  'in-progress': 'In Progress',
  'not-started': 'Not Started',
  'no-target': 'No Target Set',
};

const OVERALL = '__overall__';

function currentYear() {
  return new Date().getFullYear();
}

// A few years either side of now: targets are set just ahead of a month and
// reviewed for a while afterwards.
function yearOptions() {
  const now = currentYear();
  return Array.from({ length: 7 }, (_, index) => now - 3 + index);
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-target-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

// A target's progress as a bar. Capped at 100% width so an overachieving
// month doesn't overflow its track, while the percentage beside it still
// reports the true figure.
function ProgressBar({ percent, status }) {
  if (percent === null) {
    return <div className="progress-track progress-track-empty" aria-hidden="true" />;
  }
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`progress-fill progress-fill-${status}`} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function formatPercent(percent) {
  // A zero target makes the percentage undefined rather than infinite
  // (PROJECT_SPEC.md §19) — the API sends null and it is shown as such.
  return percent === null ? '—' : `${formatMoney(percent)}%`;
}

// Monthly Targets (PROJECT_SPEC.md §19), with the approved company-wise
// extension: a month has one overall target, and optionally a target per
// manufacturer.
//
// Every figure — achieved, remaining, achievement %, status — is computed by
// the backend from the same valid-sales definition Sales Reports use (§34).
// Nothing on this page does sales arithmetic.
export default function Targets() {
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [view, setView] = useState('all'); // 'all' | 'overall'

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [companies, setCompanies] = useState([]);

  const [form, setForm] = useState({ company: OVERALL, targetAmount: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTargets = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await getTargets({ year, month, scope: view });
      setData(result);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [year, month, view]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Loaded once for the form's company list. A failure here costs only the
  // dropdown's suggestions, so it must not take the page down.
  useEffect(() => {
    let cancelled = false;
    listProductCompanies()
      .then((result) => {
        if (!cancelled) setCompanies(result.companies);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const amount = Number(form.targetAmount);
    if (form.targetAmount === '' || !Number.isFinite(amount) || amount < 0) {
      setFormError('Enter a target amount of zero or more.');
      return;
    }

    setIsSaving(true);
    try {
      const company = form.company === OVERALL ? null : form.company;
      await setTarget({ year, month, company, targetAmount: amount });
      setSuccess(
        `${company ? `${company} target` : 'Overall target'} for ${MONTHS[month - 1]} ${year} set to ${formatMoney(
          amount
        )}.`
      );
      setForm((current) => ({ ...current, targetAmount: '' }));
      await fetchTargets();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    setIsDeleting(true);
    try {
      await deleteTarget(confirmTarget.id);
      setConfirmTarget(null);
      setSuccess('Target removed.');
      await fetchTargets();
    } catch (err) {
      setFormError(err.message);
      setConfirmTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  // Prefills the form when editing an existing row, so "Edit" doesn't mean
  // retyping the month and company.
  function editRow(row) {
    setForm({ company: row.company ?? OVERALL, targetAmount: String(row.targetAmount || '') });
    setSuccess(null);
    setFormError(null);
  }

  const rows = data ? (view === 'overall' ? [data.overall] : [data.overall, ...data.companies]) : [];

  return (
    <div>
      <div className="page-header">
        <h2>Targets</h2>
      </div>

      {success && (
        <div className="banner-success" role="status">
          {success}
          <button type="button" className="link-button" onClick={() => setSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="filters">
        <label className="filter-field">
          Month
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          Year
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearOptions().map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          View
          <select value={view} onChange={(event) => setView(event.target.value)}>
            <option value="all">Overall + company-wise</option>
            <option value="overall">Overall only</option>
          </select>
        </label>
      </div>

      <section className="section-card">
        <h3 className="form-section-title">Set a target for {`${MONTHS[month - 1]} ${year}`}</h3>

        {formError && (
          <div className="banner-error" role="alert">
            {formError}
          </div>
        )}

        <form className="target-form" onSubmit={handleSubmit}>
          <label className="filter-field">
            Scope
            <select
              value={form.company}
              onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
            >
              <option value={OVERALL}>Overall (all companies)</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Target Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.targetAmount}
              placeholder="0.00"
              onChange={(event) => setForm((current) => ({ ...current, targetAmount: event.target.value }))}
              required
            />
          </label>
          <div className="filter-actions">
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Target'}
            </button>
          </div>
        </form>

        <p className="picker-note">
          Saving replaces the target for the selected month and scope. Company targets are measured against that
          manufacturer&apos;s products only; the overall target covers the whole month.
        </p>
      </section>

      {status === 'loading' && <div className="page-placeholder">Loading targets…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load targets: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchTargets}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="target-cards">
            {rows.map((row) => (
              <div
                key={row.company ?? 'overall'}
                className={row.scope === 'overall' ? 'target-card target-card-primary' : 'target-card'}
              >
                <div className="target-card-head">
                  <span className="target-card-title">{row.company ?? 'Overall'}</span>
                  <StatusBadge status={row.status} />
                </div>

                <div className="target-card-figure">{formatPercent(row.achievementPercent)}</div>
                <ProgressBar percent={row.achievementPercent} status={row.status} />

                <dl className="summary-list target-card-list">
                  <div className="summary-row">
                    <dt>Target</dt>
                    <dd>{row.targetAmount > 0 ? formatMoney(row.targetAmount) : '—'}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Achieved</dt>
                    <dd>{formatMoney(row.achieved)}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>{row.remaining < 0 ? 'Exceeded By' : 'Remaining'}</dt>
                    <dd>{formatMoney(Math.abs(row.remaining))}</dd>
                  </div>
                  <div className="summary-row">
                    <dt>Valid Orders</dt>
                    <dd>{row.orders}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th className="numeric">Target</th>
                  <th className="numeric">Achieved</th>
                  <th className="numeric">Remaining</th>
                  <th className="numeric">Achievement %</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.company ?? 'overall'}>
                    <td>{row.company ?? <strong>Overall</strong>}</td>
                    <td className="numeric">{row.targetAmount > 0 ? formatMoney(row.targetAmount) : '—'}</td>
                    <td className="numeric line-total">{formatMoney(row.achieved)}</td>
                    <td className={row.remaining < 0 ? 'numeric target-exceeded' : 'numeric'}>
                      {row.remaining < 0 ? `+${formatMoney(Math.abs(row.remaining))}` : formatMoney(row.remaining)}
                    </td>
                    <td className="numeric">{formatPercent(row.achievementPercent)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="row-actions">
                      <button type="button" className="row-action-primary" onClick={() => editRow(row)}>
                        {row.id ? 'Edit' : 'Set Target'}
                      </button>
                      {row.id && (
                        <button type="button" onClick={() => setConfirmTarget(row)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="picker-note">
            Achieved counts only submitted orders — drafts and cancelled orders are excluded. Bonus quantities are free
            and add nothing; line discounts are already deducted. These are the same figures Sales Reports shows for
            this month.
          </p>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Remove this target?"
        message={
          confirmTarget
            ? `The ${confirmTarget.company ?? 'overall'} target of ${formatMoney(confirmTarget.targetAmount)} for ${
                MONTHS[month - 1]
              } ${year} will be removed. Orders and sales figures are not affected.`
            : ''
        }
        confirmLabel="Remove Target"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
