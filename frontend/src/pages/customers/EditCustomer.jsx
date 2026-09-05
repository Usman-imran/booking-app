import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CustomerForm from './CustomerForm.jsx';
import { getCustomer, updateCustomer } from '../../api/customers.js';

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getCustomer(id)
      .then((data) => {
        if (!cancelled) {
          setCustomer(data.customer);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

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
        <Link to="/customers">Back to Customers</Link>
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
