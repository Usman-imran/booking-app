import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CustomerForm from './CustomerForm.jsx';
import { getCustomer, updateCustomer } from '../../api/customers.js';

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // Lifted out of the effect so the error state can offer a Retry rather
  // than leaving a browser reload as the only way forward.
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

  async function handleSubmit(values) {
    await updateCustomer(id, values);
    navigate(`/customers/${id}`, { replace: true });
  }

  if (status === 'loading') {
    return <div className="page-placeholder">Loading customer…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-placeholder">
        <p>Could not load customer: {error}</p>
        <div className="form-actions">
          <Link to="/customers" className="btn-secondary">
            Back to Customers
          </Link>
          <button type="button" className="btn-primary" onClick={fetchCustomer}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Edit Customer</h2>
      </div>
      <CustomerForm
        initialValues={{
          name: customer.name,
          code: customer.code,
          contactPerson: customer.contactPerson || '',
          phone: customer.phone || '',
          alternatePhone: customer.alternatePhone || '',
          address: customer.address || '',
          cityArea: customer.cityArea || '',
          customerType: customer.customerType || '',
        }}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/customers/${id}`)}
      />
    </div>
  );
}
