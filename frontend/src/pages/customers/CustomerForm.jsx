import { useState } from 'react';

const EMPTY_FORM = {
  name: '',
  code: '',
  contactPerson: '',
  phone: '',
  alternatePhone: '',
  address: '',
  cityArea: '',
  customerType: '',
};

export default function CustomerForm({ initialValues, submitLabel, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY_FORM, ...initialValues });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!values.name.trim() || !values.code.trim()) {
      setError('Customer name and code are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid">
        <label>
          Customer Name *
          <input type="text" value={values.name} onChange={handleChange('name')} required />
        </label>
        <label>
          Customer Code *
          <input type="text" value={values.code} onChange={handleChange('code')} required />
        </label>
        <label>
          Contact Person
          <input type="text" value={values.contactPerson} onChange={handleChange('contactPerson')} />
        </label>
        <label>
          Phone
          <input type="text" value={values.phone} onChange={handleChange('phone')} />
        </label>
        <label>
          Alternate Phone
          <input type="text" value={values.alternatePhone} onChange={handleChange('alternatePhone')} />
        </label>
        <label>
          City/Area
          <input type="text" value={values.cityArea} onChange={handleChange('cityArea')} />
        </label>
        <label>
          Customer Type
          <input type="text" value={values.customerType} onChange={handleChange('customerType')} />
        </label>
        <label className="form-grid-full">
          Address
          <textarea rows={3} value={values.address} onChange={handleChange('address')} />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
