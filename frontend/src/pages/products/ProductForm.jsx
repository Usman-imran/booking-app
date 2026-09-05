import { useState } from 'react';

const EMPTY_FORM = {
  name: '',
  code: '',
  company: '',
  packing: '',
  unit: '',
  mrp: '',
  salePrice: '',
  discount: '0',
  schemeEnabled: false,
  schemePurchaseQty: '',
  schemeBonusQty: '',
};

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export default function ProductForm({ initialValues, submitLabel, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY_FORM, ...initialValues });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field) {
    return (event) => {
      const value = field === 'schemeEnabled' ? event.target.checked : event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  function validate() {
    if (!values.name.trim() || !values.code.trim()) {
      return 'Product name and code are required.';
    }

    const mrp = toNumberOrNull(values.mrp);
    if (mrp === null || mrp < 0) {
      return 'MRP must be a valid non-negative number.';
    }

    const salePrice = toNumberOrNull(values.salePrice);
    if (salePrice === null || salePrice < 0) {
      return 'Sale Price must be a valid non-negative number.';
    }

    const discount = values.discount === '' ? 0 : toNumberOrNull(values.discount);
    if (discount === null || discount < 0 || discount > 100) {
      return 'Discount must be a number between 0 and 100.';
    }

    if (values.schemeEnabled) {
      const purchaseQty = toNumberOrNull(values.schemePurchaseQty);
      if (!Number.isInteger(purchaseQty) || purchaseQty <= 0) {
        return 'Purchase Quantity must be a positive whole number when the bonus scheme is enabled.';
      }
      const bonusQty = toNumberOrNull(values.schemeBonusQty);
      if (!Number.isInteger(bonusQty) || bonusQty < 0) {
        return 'Bonus Quantity must be zero or a positive whole number when the bonus scheme is enabled.';
      }
    }

    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      name: values.name.trim(),
      code: values.code.trim(),
      company: values.company.trim() || null,
      packing: values.packing.trim() || null,
      unit: values.unit.trim() || null,
      mrp: toNumberOrNull(values.mrp),
      salePrice: toNumberOrNull(values.salePrice),
      discount: values.discount === '' ? 0 : toNumberOrNull(values.discount),
      schemeEnabled: values.schemeEnabled,
      schemePurchaseQty: values.schemeEnabled ? toNumberOrNull(values.schemePurchaseQty) : null,
      schemeBonusQty: values.schemeEnabled ? toNumberOrNull(values.schemeBonusQty) : null,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasSchemePreview = values.schemeEnabled && values.schemePurchaseQty !== '' && values.schemeBonusQty !== '';

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid">
        <label>
          Product Name *
          <input type="text" value={values.name} onChange={handleChange('name')} required />
        </label>
        <label>
          Product Code *
          <input type="text" value={values.code} onChange={handleChange('code')} required />
        </label>
        <label>
          Company/Manufacturer
          <input type="text" value={values.company} onChange={handleChange('company')} />
        </label>
        <label>
          Packing
          <input type="text" value={values.packing} onChange={handleChange('packing')} />
        </label>
        <label>
          Unit
          <input type="text" value={values.unit} onChange={handleChange('unit')} />
        </label>
      </div>

      <h3 className="form-section-title">Pricing</h3>
      <div className="form-grid">
        <label>
          MRP *
          <input type="number" min="0" step="0.01" value={values.mrp} onChange={handleChange('mrp')} required />
        </label>
        <label>
          Sale Price *
          <input type="number" min="0" step="0.01" value={values.salePrice} onChange={handleChange('salePrice')} required />
        </label>
        <label>
          Discount (%)
          <input type="number" min="0" max="100" step="0.01" value={values.discount} onChange={handleChange('discount')} />
        </label>
      </div>

      <h3 className="form-section-title">Bonus Scheme</h3>
      <label className="checkbox-label">
        <input type="checkbox" checked={values.schemeEnabled} onChange={handleChange('schemeEnabled')} />
        Enable bonus scheme
      </label>

      {values.schemeEnabled && (
        <div className="form-grid">
          <label>
            Purchase Quantity *
            <input
              type="number"
              min="1"
              step="1"
              value={values.schemePurchaseQty}
              onChange={handleChange('schemePurchaseQty')}
              required
            />
          </label>
          <label>
            Bonus Quantity *
            <input
              type="number"
              min="0"
              step="1"
              value={values.schemeBonusQty}
              onChange={handleChange('schemeBonusQty')}
              required
            />
          </label>
        </div>
      )}

      {values.schemeEnabled && (
        <p className={hasSchemePreview ? 'scheme-preview' : 'scheme-preview scheme-preview-muted'}>
          {hasSchemePreview
            ? `Example: buy ${values.schemePurchaseQty}, get ${values.schemeBonusQty} free — shown as "${values.schemePurchaseQty} + ${values.schemeBonusQty}".`
            : 'Enter both quantities to see an example, e.g. 20 + 2.'}
        </p>
      )}

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
