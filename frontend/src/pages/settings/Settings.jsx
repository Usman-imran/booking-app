import { useEffect, useState } from 'react';
import { updateCompanyName } from '../../api/auth.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const COMPANY_NAME_MAX = 150;

// Application-level settings (PROJECT_SPEC.md §24). Deliberately minimal:
// §24 permits a Settings section for non-business configuration and warns
// against inventing settings without a requirement, so this holds the one
// thing that genuinely is application-level — what the business is called.
//
// No business data belongs here. Customers, products, orders, targets and
// reports all have their own modules.
export default function Settings() {
  const { user, refreshUser } = useAuth();

  const [companyName, setCompanyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Seeded from the session, and re-seeded if it changes underneath (a
  // rename in another tab, say).
  useEffect(() => {
    setCompanyName(user?.companyName ?? '');
  }, [user?.companyName]);

  const trimmed = companyName.trim();
  const isUnchanged = trimmed === (user?.companyName ?? '');

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!trimmed) {
      setError('Enter a company name — it appears in the sidebar and on every order receipt.');
      return;
    }

    setIsSaving(true);
    try {
      const data = await updateCompanyName(trimmed);
      // Refreshes the session so the sidebar and any open receipt pick the
      // new name up immediately, without a reload.
      await refreshUser();
      setSuccess(
        data.accountsUpdated > 1
          ? `Saved. All ${data.accountsUpdated} accounts on this installation now use this name.`
          : 'Saved.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <section className="form-card">
        <h3 className="form-section-title">Company</h3>

        {error && (
          <div className="banner-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="banner-success" role="status">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-grid-full">
              Company name
              <input
                type="text"
                value={companyName}
                maxLength={COMPANY_NAME_MAX}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Al-Noor Distributors"
                disabled={isSaving}
                required
              />
            </label>
          </div>

          <p className="picker-note">
            This is the name shown in the sidebar and printed at the top of every order receipt. It applies to
            everyone signed in to this installation — there is one business per installation, so renaming it renames it
            for all bookers.
          </p>
          <p className="picker-note">
            Receipts are generated from the current name each time they are exported, so re-exporting an older order
            will show the new name. The orders themselves — their products, prices, discounts and totals — are never
            affected.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={isSaving || isUnchanged || !trimmed}>
              {isSaving ? 'Saving…' : 'Save Company Name'}
            </button>
          </div>
        </form>
      </section>

      <section className="detail-card">
        <h3 className="form-section-title">Signed in as</h3>
        <dl className="detail-grid">
          <div>
            <dt>Name</dt>
            <dd>{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{user?.username ?? '—'}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{user?.phone || '—'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-badge ${user?.isActive ? 'status-active' : 'status-inactive'}`}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>
        </dl>
        <p className="picker-note">
          These details are set when an account is created and aren&apos;t editable here. There are no roles or
          permissions in this application — every booker has the same access.
        </p>
      </section>
    </div>
  );
}
