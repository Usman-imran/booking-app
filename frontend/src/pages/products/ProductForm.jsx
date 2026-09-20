import { useState } from 'react';

// Same cap as the API: more tiers than this is a typo, not a scheme.
const MAX_BONUS_SCHEMES = 10;

const EMPTY_FORM = {
  name: '',
  code: '',
  company: '',
  packing: '',
  unit: '',
  mrp: '',
  salePrice: '',
  discount: '0',
  // One row per tier: { key, buyQty, bonusQty }. `key` is only for React
  // to tell rows apart as they come and go; it is never sent.
  bonusSchemes: [],
};

let nextRowKey = 0;

// A blank row, or one pre-filled from a saved tier.
export function newSchemeRow(tier) {
  nextRowKey += 1;
  return {
    key: `scheme-${nextRowKey}`,
    buyQty: tier ? String(tier.purchaseQty) : '',
    bonusQty: tier ? String(tier.bonusQty) : '',
  };
}

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
      const value = event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
    };
  }

  function handleSchemeChange(key, field) {
    return (event) => {
      const value = event.target.value;
      setValues((current) => ({
        ...current,
        bonusSchemes: current.bonusSchemes.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
      }));
    };
  }

  function addScheme() {
    setValues((current) =>
      current.bonusSchemes.length >= MAX_BONUS_SCHEMES
        ? current
        : { ...current, bonusSchemes: [...current.bonusSchemes, newSchemeRow()] }
    );
  }

  function removeScheme(key) {
    setValues((current) => ({ ...current, bonusSchemes: current.bonusSchemes.filter((row) => row.key !== key) }));
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

    // Every tier needs a positive whole purchase quantity and a bonus of
    // zero or more, and no two may share a purchase quantity — the server
    // could not tell which one applies.
    const seen = new Set();
    for (const [index, row] of values.bonusSchemes.entries()) {
      const purchaseQty = toNumberOrNull(row.buyQty);
      if (!Number.isInteger(purchaseQty) || purchaseQty <= 0) {
        return `Bonus scheme ${index + 1}: Buy Quantity must be a positive whole number.`;
      }
      if (seen.has(purchaseQty)) {
        return `Bonus scheme ${index + 1}: another tier already uses a Buy Quantity of ${purchaseQty}.`;
      }
      seen.add(purchaseQty);
      const bonusQty = toNumberOrNull(row.bonusQty);
      if (!Number.isInteger(bonusQty) || bonusQty < 0) {
        return `Bonus scheme ${index + 1}: Bonus Quantity must be zero or a positive whole number.`;
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
      bonusSchemes: values.bonusSchemes
        .map((row) => ({ purchaseQty: Number(row.buyQty), bonusQty: Number(row.bonusQty) }))
        .sort((a, b) => a.purchaseQty - b.purchaseQty),
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

  // "10 + 1, 50 + 6" for the rows that are filled in, in the order they
  // will apply.
  const schemePreview = values.bonusSchemes
    .filter((row) => row.buyQty !== '' && row.bonusQty !== '')
    .map((row) => ({ buy: Number(row.buyQty), bonus: Number(row.bonusQty) }))
    .filter((tier) => Number.isFinite(tier.buy) && Number.isFinite(tier.bonus))
    .sort((a, b) => a.buy - b.buy)
    .map((tier) => `${tier.buy} + ${tier.bonus}`)
    .join(', ');

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

      <h3 className="form-section-title">Bonus Schemes</h3>
      <p className="form-hint">
        Give free units when a quantity threshold is reached. Add a row per tier, e.g. 10 + 1 and 50 + 6; the
        highest tier an order reaches is the one applied.
      </p>

      {values.bonusSchemes.map((row, index) => (
        <div key={row.key} className="scheme-row">
          <label>
            Buy Quantity *
            <input
              type="number"
              min="1"
              step="1"
              value={row.buyQty}
              onChange={handleSchemeChange(row.key, 'buyQty')}
              placeholder="e.g. 20"
              required
            />
          </label>
          <label>
            Bonus Quantity *
            <input
              type="number"
              min="0"
              step="1"
              value={row.bonusQty}
              onChange={handleSchemeChange(row.key, 'bonusQty')}
              placeholder="e.g. 2"
              required
            />
          </label>
          <button
            type="button"
            className="btn-danger scheme-row-remove"
            onClick={() => removeScheme(row.key)}
            disabled={isSubmitting}
            aria-label={`Remove bonus scheme ${index + 1}`}
            title="Remove this tier">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      ))}

      {values.bonusSchemes.length < MAX_BONUS_SCHEMES && (
        <button type="button" className="btn-secondary" onClick={addScheme} disabled={isSubmitting}>
          + Add Bonus Scheme
        </button>
      )}

      <p className={schemePreview ? 'scheme-preview' : 'scheme-preview scheme-preview-muted'}>
        {values.bonusSchemes.length === 0
          ? 'No bonus scheme. Orders for this product will not earn free units.'
          : schemePreview
            ? `Shown as "${schemePreview}".`
            : 'Enter both quantities to see how the scheme will be shown, e.g. 20 + 2.'}
      </p>

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
