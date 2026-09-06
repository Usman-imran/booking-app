import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createOrder, getOrder, submitDraftOrder, updateDraftOrder } from '../../api/orders.js';
import { listProducts } from '../../api/products.js';
import { formatScheme } from '../products/schemeFormat.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import CustomerPicker from './CustomerPicker.jsx';
import ProductPicker from './ProductPicker.jsx';
import { calculateLine, calculateTotals, formatMoney } from './orderCalc.js';

// Mirrors the backend's own caps so the booker is told before a request is
// wasted (the server enforces them regardless).
const MAX_ITEMS = 200;
const MAX_QUANTITY = 1000000;
const REMARKS_MAX = 1000;

// Quantities live in state as strings so the box can be empty mid-edit
// instead of snapping back to a number the booker didn't type.
function parseQty(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

// True when a product's current commercial values differ from the snapshot
// stored on a saved draft line — i.e. reopening the draft has re-priced it.
function hasRepriced(item, product) {
  return (
    product.salePrice !== item.rate ||
    product.discount !== item.discount ||
    (product.schemeEnabled ? product.schemePurchaseQty : null) !== item.schemePurchaseQty ||
    (product.schemeEnabled ? product.schemeBonusQty : null) !== item.schemeBonusQty
  );
}

// The core screen of the whole application (PROJECT_SPEC.md §10): pick a
// customer, search products, enter quantities, and either save the order as
// a draft or submit it.
//
// It serves two routes. At `/orders/new` it builds a new order. At
// `/orders/drafts/:id/edit` it continues a saved draft (PROJECT_SPEC.md
// §13) — the draft's customer, items and remarks are loaded back in, and
// every line is re-priced from its product's current values, which is what
// will be saved.
//
// Every figure shown is a live preview computed by orderCalc.js. The server
// recalculates all of it from the products' own values when the order is
// saved and returns the authoritative result, which is what the success
// banner reports.
export default function CreateOrder() {
  const { id: draftId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(draftId);

  const [customer, setCustomer] = useState(null);
  // Each entry is { product, quantity } — the full product is kept so the
  // line can be re-priced live without re-fetching it.
  const [lines, setLines] = useState([]);
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(null); // null | 'draft' | 'submitted'
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Loading an existing draft (edit mode only).
  const [loadStatus, setLoadStatus] = useState(isEditing ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState(null);
  const [notDraft, setNotDraft] = useState(null);
  const [repricedProducts, setRepricedProducts] = useState([]);
  const [unavailableProducts, setUnavailableProducts] = useState([]);
  // Bumped by Retry to re-run the draft load below without leaving the page.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!draftId) return undefined;

    let cancelled = false;

    (async () => {
      setLoadStatus('loading');
      setLoadError(null);
      setNotDraft(null);
      try {
        const { order } = await getOrder(draftId);
        if (cancelled) return;

        // Submitted orders are not editable (PROJECT_SPEC.md §14).
        if (order.status !== 'draft') {
          setNotDraft(order);
          setLoadStatus('ready');
          return;
        }

        // Re-priced from the products as they are NOW, not from the saved
        // snapshot — the same rule the lines followed when they were first
        // added (PROJECT_SPEC.md §6). Nothing is locked until submission.
        const productIds = order.items.map((item) => item.productId);
        const products = productIds.length > 0 ? (await listProducts({ ids: productIds })).products : [];
        if (cancelled) return;

        const productsById = new Map(products.map((product) => [product.id, product]));
        const nextLines = [];
        const repriced = [];
        const unavailable = [];

        for (const item of order.items) {
          const product = productsById.get(item.productId);
          // A product deactivated since the draft was saved can't be
          // ordered any more, so the line is dropped and called out rather
          // than silently failing on save.
          if (!product || !product.isActive) {
            unavailable.push(item.productName);
            continue;
          }
          if (hasRepriced(item, product)) {
            repriced.push(product.name);
          }
          nextLines.push({ product, quantity: String(item.paidQty) });
        }

        setCustomer(order.customer);
        setLines(nextLines);
        setRemarks(order.remarks ?? '');
        setRepricedProducts(repriced);
        setUnavailableProducts(unavailable);
        setLoadStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.message);
        setLoadStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, reloadToken]);

  const addedProductIds = useMemo(() => new Set(lines.map((line) => line.product.id)), [lines]);

  // Re-derived on every render: rate, discount, bonus and line totals always
  // reflect the quantity currently in the box.
  const calculatedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        calc: calculateLine(line.product, parseQty(line.quantity) ?? 0),
      })),
    [lines]
  );

  const totals = useMemo(() => calculateTotals(calculatedLines.map((line) => line.calc)), [calculatedLines]);

  const isBusy = saving !== null;

  function addProduct(product) {
    setSuccess(null);
    setValidationError(null);
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.product.id === product.id);

      // Adding a product that's already on the order bumps its quantity
      // rather than creating a second line — the API takes each product
      // once, with one total quantity.
      if (existingIndex >= 0) {
        return current.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: String(Math.min((parseQty(line.quantity) ?? 0) + 1, MAX_QUANTITY)) }
            : line
        );
      }

      if (current.length >= MAX_ITEMS) return current;

      // The product is snapshotted into the line as it is right now, which
      // is what the rate/discount/scheme preview is based on.
      return [...current, { product, quantity: '1' }];
    });
  }

  function updateQuantity(productId, quantity) {
    setValidationError(null);
    setLines((current) => current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)));
  }

  function removeLine(productId) {
    setValidationError(null);
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }

  function resetForm() {
    setCustomer(null);
    setLines([]);
    setRemarks('');
    setValidationError(null);
    setError(null);
  }

  // Mirrors the API's rules so problems are caught before a round trip
  // (PROJECT_SPEC.md §26). The server validates all of this again.
  function validate(status) {
    if (!customer) {
      return 'Select a customer before saving this order.';
    }

    if (status === 'submitted' && lines.length === 0) {
      return 'Add at least one product before submitting the order.';
    }

    for (const line of lines) {
      const qty = parseQty(line.quantity);
      if (qty === null) {
        return `Enter a whole-number quantity for ${line.product.name}.`;
      }
      if (qty <= 0) {
        return `Quantity for ${line.product.name} must be greater than 0.`;
      }
      if (qty > MAX_QUANTITY) {
        return `Quantity for ${line.product.name} must be at most ${MAX_QUANTITY.toLocaleString()}.`;
      }
    }

    if (remarks.trim().length > REMARKS_MAX) {
      return `Remarks must be at most ${REMARKS_MAX} characters.`;
    }

    return null;
  }

  async function save(status) {
    setError(null);
    setSuccess(null);

    const problem = validate(status);
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);

    const payload = {
      customerId: customer.id,
      remarks: remarks.trim() || null,
      items: lines.map((line) => ({ productId: line.product.id, quantity: parseQty(line.quantity) })),
    };

    setSaving(status);
    try {
      if (!isEditing) {
        const data = await createOrder({ ...payload, status });
        // Report the server's own figures, not the preview's — they are
        // what was actually stored.
        setSuccess(data.order);
        resetForm();
        return;
      }

      // Editing: the draft's contents are always saved first, so what was
      // on screen is exactly what gets submitted — never a stale version.
      const updated = await updateDraftOrder(draftId, payload);

      if (status === 'draft') {
        setSuccess(updated.order);
        setRepricedProducts([]);
        setUnavailableProducts([]);
        return;
      }

      await submitDraftOrder(draftId);
      // Land on the order itself, where its new order number is shown.
      navigate(`/orders/${draftId}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  // --- Edit-mode load states -----------------------------------------
  if (isEditing && loadStatus === 'loading') {
    return <div className="page-placeholder">Loading draft…</div>;
  }

  if (isEditing && loadStatus === 'error') {
    return (
      <div className="page-placeholder">
        <p>Could not load this draft: {loadError}</p>
        <div className="form-actions">
          <Link to="/orders/drafts" className="btn-secondary">
            Back to Drafts
          </Link>
          <button type="button" className="btn-primary" onClick={() => setReloadToken((token) => token + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isEditing && notDraft) {
    return (
      <div className="page-placeholder">
        <h2>This order can no longer be edited</h2>
        <p>
          Order {notDraft.orderNumber} has already been {notDraft.status}. Submitted orders are permanent — to change
          one, cancel it and create a new order.
        </p>
        <div className="form-actions">
          <Link to="/orders/drafts" className="btn-secondary">
            Back to Drafts
          </Link>
          <Link to={`/orders/${notDraft.id}`} className="btn-primary">
            View Order
          </Link>
        </div>
      </div>
    );
  }

  const hasUnsavedWork = Boolean(customer || lines.length > 0 || remarks.trim());

  return (
    <div>
      <div className="page-header">
        <h2>{isEditing ? 'Continue Draft' : 'Create Order'}</h2>
        <div className="header-actions">
          {isEditing && (
            <Link to="/orders/drafts" className="btn-secondary">
              Back to Drafts
            </Link>
          )}
          {!isEditing && hasUnsavedWork && (
            <button type="button" className="btn-secondary" onClick={() => setConfirmDiscard(true)} disabled={isBusy}>
              Clear Order
            </button>
          )}
        </div>
      </div>

      {success && (
        <div className="banner-success" role="status">
          <strong>
            {isEditing
              ? 'Draft updated.'
              : success.status === 'draft'
                ? 'Draft saved.'
                : `Order ${success.orderNumber} submitted.`}
          </strong>{' '}
          {success.customer?.name} — {success.items.length} item{success.items.length === 1 ? '' : 's'}, grand total{' '}
          {formatMoney(success.total)}.
          {success.status === 'draft' && ' It has no order number yet — one is assigned when the draft is submitted.'}
          <button type="button" className="link-button" onClick={() => setSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      {unavailableProducts.length > 0 && (
        <div className="banner-error" role="alert">
          {unavailableProducts.length === 1 ? 'A product has' : `${unavailableProducts.length} products have`} been
          deactivated since this draft was saved and {unavailableProducts.length === 1 ? 'was' : 'were'} removed from
          it: {unavailableProducts.join(', ')}. Save the draft to keep this change.
        </div>
      )}

      {repricedProducts.length > 0 && (
        <div className="banner-info">
          Prices, discounts or schemes have changed since this draft was saved, so it has been re-priced at
          today&apos;s values: {repricedProducts.join(', ')}. The figures below are what will be saved.
        </div>
      )}

      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      <section className="section-card">
        <h3 className="form-section-title">1. Customer</h3>
        <CustomerPicker value={customer} onChange={setCustomer} disabled={isBusy} />
      </section>

      <div className="order-layout">
        <div className="order-main">
          <section className="section-card">
            <h3 className="form-section-title">2. Add Products</h3>
            <ProductPicker
              addedProductIds={addedProductIds}
              onAdd={addProduct}
              disabled={isBusy}
              limitReached={lines.length >= MAX_ITEMS}
            />
          </section>

          <section className="section-card">
            <h3 className="form-section-title">3. Order Items</h3>

            {calculatedLines.length === 0 ? (
              <div className="picker-message">
                No products added yet. Search above and press Add — quantities, discounts and bonus quantities are
                calculated here as you type.
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="numeric">Rate</th>
                      <th className="numeric">Qty</th>
                      <th>Scheme</th>
                      <th className="numeric">Bonus</th>
                      <th className="numeric">Subtotal</th>
                      <th className="numeric">Discount</th>
                      <th className="numeric">Line Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedLines.map(({ product, quantity, calc }) => {
                      const qty = parseQty(quantity);
                      const isInvalid = qty === null || qty <= 0 || qty > MAX_QUANTITY;
                      return (
                        <tr key={product.id}>
                          <td>
                            <div>{product.name}</div>
                            <div className="muted">
                              {product.code}
                              {product.packing ? ` · ${product.packing}` : ''}
                            </div>
                          </td>
                          <td className="numeric">{formatMoney(calc.rate)}</td>
                          <td className="numeric">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className={isInvalid ? 'qty-input qty-input-invalid' : 'qty-input'}
                              value={quantity}
                              disabled={isBusy}
                              aria-label={`Quantity for ${product.name}`}
                              aria-invalid={isInvalid}
                              onChange={(event) => updateQuantity(product.id, event.target.value)}
                            />
                          </td>
                          <td>{formatScheme(product)}</td>
                          <td className="numeric">
                            {calc.bonusQty > 0 ? <span className="bonus-badge">+{calc.bonusQty}</span> : '—'}
                          </td>
                          <td className="numeric">{formatMoney(calc.lineSubtotal)}</td>
                          <td className="numeric">
                            {calc.discount > 0 ? (
                              <>
                                {formatMoney(calc.lineDiscount)}{' '}
                                <span className="muted">({formatMoney(calc.discount)}%)</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="numeric line-total">{formatMoney(calc.lineTotal)}</td>
                          <td>
                            <button
                              type="button"
                              className="link-button link-danger"
                              onClick={() => removeLine(product.id)}
                              disabled={isBusy}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {calculatedLines.length > 0 && (
              <p className="picker-note">
                Bonus quantity is free and carries no value — it is added on top of the paid quantity, never taken out
                of it.
              </p>
            )}
          </section>
        </div>

        <aside className="order-summary">
          <div className="summary-card">
            <h3 className="form-section-title">4. Order Summary</h3>

            <dl className="summary-list">
              <div className="summary-row">
                <dt>Total Items</dt>
                <dd>{totals.totalItems}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Paid Qty</dt>
                <dd>{totals.totalPaidQty}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Bonus Qty</dt>
                <dd>{totals.totalBonusQty > 0 ? <span className="bonus-badge">+{totals.totalBonusQty}</span> : 0}</dd>
              </div>
              <div className="summary-row">
                <dt>Subtotal</dt>
                <dd>{formatMoney(totals.subtotal)}</dd>
              </div>
              <div className="summary-row">
                <dt>Total Discount</dt>
                <dd>{totals.discountTotal > 0 ? `− ${formatMoney(totals.discountTotal)}` : formatMoney(0)}</dd>
              </div>
              <div className="summary-row summary-grand-total">
                <dt>Grand Total</dt>
                <dd>{formatMoney(totals.total)}</dd>
              </div>
            </dl>

            <label className="summary-remarks">
              Remarks
              <textarea
                rows="3"
                value={remarks}
                maxLength={REMARKS_MAX}
                disabled={isBusy}
                placeholder="Optional note for this order…"
                onChange={(event) => setRemarks(event.target.value)}
              />
              <span className="muted">
                {remarks.length}/{REMARKS_MAX}
              </span>
            </label>

            {validationError && (
              <div className="banner-error" role="alert">
                {validationError}
              </div>
            )}

            <div className="summary-actions">
              <button type="button" className="btn-secondary" onClick={() => save('draft')} disabled={isBusy}>
                {saving === 'draft' ? 'Saving…' : isEditing ? 'Save Draft' : 'Save as Draft'}
              </button>
              <button type="button" className="btn-primary" onClick={() => save('submitted')} disabled={isBusy}>
                {saving === 'submitted' ? 'Submitting…' : 'Submit Order'}
              </button>
            </div>

            <p className="summary-note">
              {isEditing
                ? 'Saving keeps this a draft, with no order number. Submitting saves your changes first, then finalizes the order — it gets its order number and cannot be edited afterwards, only cancelled.'
                : 'A draft can be finished later and takes no order number. Submitting is final — a submitted order gets its order number and cannot be edited afterwards, only cancelled.'}
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Clear this order?"
        message="The selected customer, all added products and the remarks will be discarded. This cannot be undone."
        confirmLabel="Clear Order"
        onConfirm={() => {
          resetForm();
          setConfirmDiscard(false);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
