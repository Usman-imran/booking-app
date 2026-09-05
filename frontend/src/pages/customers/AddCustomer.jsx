import { useNavigate } from 'react-router-dom';
import CustomerForm from './CustomerForm.jsx';
import { createCustomer } from '../../api/customers.js';

export default function AddCustomer() {
  const navigate = useNavigate();

  async function handleSubmit(values) {
    const { customer } = await createCustomer(values);
    navigate(`/customers/${customer.id}`, { replace: true });
  }

  return (
    <div>
      <div className="page-header">
        <h2>Add Customer</h2>
      </div>
      <CustomerForm submitLabel="Create Customer" onSubmit={handleSubmit} onCancel={() => navigate('/customers')} />
    </div>
  );
}
