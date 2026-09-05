import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deactivateCustomer, getCustomer, updateCustomer } from '../../api/customers.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

export default function CustomerDetails() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchCustomer = useCallback(() => {
    setStatus('loading');
    setError(null);
    return getCustomer(id)
      .then((data) => {
        setCustomer(data.customer);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [id]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  async function handleConfirmToggle() {
    setIsMutating(true);
    setActionError(null);
    try {
      if (customer.isActive) {
        await deactivateCustomer(id);
      } else {
        await updateCustomer(id, { isActive: true });
      }
      setConfirmOpen(false);
      await fetchCustomer();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  if (status === 'loading') {
    return <div className="page-placeholder">Loading customer…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-placeholder">
        <p>Could not load customer: {error}</p>
        <Link to="/customers">Back to Customers</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          {customer.name}{' '}
          <span className={`status-badge ${customer.isActive ? 'status-active' : 'status-inactive'}`}>
            {customer.isActive ? 'Active' : 'Inactive'}
          </span>
        </h2>
      </div>

      {actionError && (
        <div className="banner-error" role="alert">
          {actionError}
        </div>
      )}

      <div className="detail-card">
        <dl className="detail-grid">
          <div>
            <dt>Customer Code</dt>
            <dd>{customer.code}</dd>
          </div>
          <div>
            <dt>Customer Type</dt>
            <dd>{customer.customerType || '—'}</dd>
          </div>
          <div>
            <dt>Contact Person</dt>
            <dd>{customer.contactPerson || '—'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{customer.phone || '—'}</dd>
          </div>
          <div>
            <dt>Alternate Phone</dt>
            <dd>{customer.alternatePhone || '—'}</dd>
          </div>
          <div>
            <dt>City/Area</dt>
            <dd>{customer.cityArea || '—'}</dd>
          </div>
          <div className="detail-grid-full">
            <dt>Address</dt>
            <dd>{customer.address || '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="form-actions">
        <Link to="/customers" className="btn-secondary">
          Back to Customers
        </Link>
        <Link to={`/customers/${id}/edit`} className="btn-secondary">
          Edit
        </Link>
        <button type="button" className="btn-danger" onClick={() => setConfirmOpen(true)}>
          {customer.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={customer.isActive ? 'Deactivate customer?' : 'Reactivate customer?'}
        message={
          customer.isActive
            ? `${customer.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
            : `${customer.name} will be marked active again.`
        }
        confirmLabel={customer.isActive ? 'Deactivate' : 'Reactivate'}
        isLoading={isMutating}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
