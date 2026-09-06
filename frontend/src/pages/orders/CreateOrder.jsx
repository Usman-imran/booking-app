import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createOrder, getOrder, submitDraftOrder, updateDraftOrder } from '../../api/orders.js';
import { listProducts } from '../../api/products.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import CustomerPicker from './CustomerPicker.jsx';
import ProductBrowser from './ProductBrowser.jsx';
import { calculateLine, calculateTotals, formatMoney } from './orderCalc.js';

// Mirrors the backend's own caps so the booker is told before a request is
// wasted (the server enforces them regardless).
const MAX_ITEMS = 200;
const MAX_QUANTITY = 1000000;
const REMARKS_MAX = 1000;

// Quantities and discounts live in state as strings so a box can be empty
// mid-edit instead of snapping back to a number the booker didn't type.
function parseQty(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function parseDiscount(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// True when a product's price or scheme differs from the snapshot stored on
// a saved draft line — i.e. reopening the draft has re-priced it.
//
// Discount is deliberately NOT compared: a line's discount is now the
// booker's to set, so a difference there is a decision, not drift.
function hasRepriced(item, product) {
  return (
    product.salePrice !== item.rate ||
    (product.schemeEnabled ? product.schemePurchaseQty : null) !== item.schemePurchaseQty ||
    (product.schemeEnabled ? product.schemeBonusQty : null) !== item.schemeBonusQty
  );
}

// The core screen of the whole application (PROJECT_SPEC.md §10): pick a
// customer, search products, enter quantities, submit.
//
// Laid out as a two-column workspace — products on the left, the order being
// built on the right — because this is the screen a booker spends the day in
// (§25). Searching never pushes the order off screen, and the running total
// is always visible. Below 1100px the two columns stack, order first.
//
// It serves two routes: `/orders/new` builds a new order, and
// `/orders/drafts/:id/edit` continues a saved draft (§13).
//
// Every figure shown is a live preview computed by orderCalc.js. The server
// recalculates all of it when the order is saved and returns the
// authoritative result, which is what the success banner reports.
export default function CreateOrder() {
  const { id: draftId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(draftId);

  const [customer, setCustomer] = useState(null);
  // Each entry is { product, quantity, discount } — the full product is kept
  // so the line can be re-priced live without re-fetching it, and `discount`
  // is this line's percentage, which the booker may override.
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
          nextLines.push({
            product,
            quantity: String(item.paidQty),
            // The SAVED discount is kept, not reset to the product's current
            // one. A discount on a draft line may have been deliberately
            // agreed, and silently reverting it would change the price.
            discount: String(item.discount),
          });
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

  // Product id -> quantity, so the browser can show what is already on the
  // order without hunting through the lines.
  const cartQuantities = useMemo(
    () => new Map(lines.map((line) => [line.product.id, parseQty(line.quantity) ?? 0])),
    [lines]
  );

  // Re-derived on every render: bonus and line totals always reflect what is
  // currently in the boxes.
  const calculatedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        calc: calculateLine(line.product, parseQty(line.quantity) ?? 0, {
          discount: parseDiscount(line.discount) ?? 0,
        }),
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

      // New lines start at the product's own discount; the booker can change
      // it per line from the cart.
      return [...current, { product, quantity: '1', discount: String(product.discount) }];
    });
  }

  function updateLine(productId, patch) {
    setValidationError(null);
    setLines((current) => current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)));
  }

  function stepQuantity(productId, delta) {
    setValidationError(null);
    setLines((current) =>
      current.map((line) => {
        if (line.product.id !== productId) return line;
        const next = Math.min(Math.max((parseQty(line.quantity) ?? 0) + delta, 1), MAX_QUANTITY);
        return { ...line, quantity: String(next) };
      })
    );
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

      const discount = parseDiscount(line.discount);
      if (discount === null) {
        return `Enter a discount for ${line.product.name}, or 0 for none.`;
      }
      if (discount < 0 || discount > 100) {
        return `Discount for ${line.product.name} must be between 0 and 100.`;
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
      items: lines.map((line) => ({
        productId: line.product.id,
        quantity: parseQty(line.quantity),
        discount: parseDiscount(line.discount),
      })),
    };

    setSaving(status);
    try {
      if (!isEditing) {
        const data = await createOrder({ ...payload, status });
        // Report the server's own figures, not the preview's — they are what
        // was actually stored.
        setSuccess(data.order);
        resetForm();
        return;
      }

      // Editing: the draft's contents are always saved first, so what was on
      // screen is exactly what gets submitted — never a stale version.
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
          Prices or schemes have changed since this draft was saved, so it has been re-priced at today&apos;s values:{' '}
          {repricedProducts.join(', ')}. Line discounts you set are kept as they were.
        </div>
      )}

      {error && (
        <div className="banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="order-workspace">
        {/* ---------------- Left: find and add products ---------------- */}
        <section className="workspace-panel">
          <h3 className="panel-title">Add Products</h3>
          <ProductBrowser
            cartQuantities={cartQuantities}
            onAdd={addProduct}
            disabled={isBusy}
            limitReached={lines.length >= MAX_ITEMS}
          />
        </section>

        {/* ---------------- Right: the order being built --------------- */}
        <aside className="workspace-cart">
          <div className="cart-card">
            <div className="cart-section">
              <h3 className="panel-title">Customer</h3>
              <CustomerPicker value={customer} onChange={setCustomer} disabled={isBusy} />
            </div>

            <div className="cart-section cart-lines-section">
              <h3 className="panel-title">
                Order Items
                {calculatedLines.length > 0 && <span className="panel-count">{calculatedLines.length}</span>}
              </h3>

              {calculatedLines.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-title">No items added yet</div>
                  <div className="cart-empty-hint">
                    Search on the left, then press <kbd>Enter</kbd> or <strong>Add</strong>.
                  </div>
                </div>
              ) : (
                <ul className="cart-lines">
                  {calculatedLines.map(({ product, quantity, discount, calc }) => {
                    const qty = parseQty(quantity);
                    const qtyInvalid = qty === null || qty <= 0 || qty > MAX_QUANTITY;
                    const parsedDiscount = parseDiscount(discount);
                    const discountInvalid = parsedDiscount === null || parsedDiscount < 0 || parsedDiscount > 100;

                    return (
                      <li key={product.id} className="cart-line">
                        <div className="cart-line-head">
                          <div className="cart-line-identity">
                            <div className="cart-line-name">{product.name}</div>
                            <div className="cart-line-meta">
                              {product.code} · {formatMoney(calc.rate)}
                              {product.packing ? ` · ${product.packing}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="cart-remove"
                            aria-label={`Remove ${product.name}`}
                            title="Remove"
                            disabled={isBusy}
                            onClick={() => removeLine(product.id)}
                          >
                            ×
                          </button>
                        </div>

                        <div className="cart-line-controls">
                          <div className="qty-stepper">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${product.name}`}
                              disabled={isBusy || (qty ?? 0) <= 1}
                              onClick={() => stepQuantity(product.id, -1)}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              className={qtyInvalid ? 'qty-input qty-input-invalid' : 'qty-input'}
                              value={quantity}
                              disabled={isBusy}
                              aria-label={`Quantity for ${product.name}`}
                              aria-invalid={qtyInvalid}
                              onChange={(event) => updateLine(product.id, { quantity: event.target.value })}
                            />
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${product.name}`}
                              disabled={isBusy}
                              onClick={() => stepQuantity(product.id, 1)}
                            >
                              +
                            </button>
                          </div>

                          <label className="discount-field">
                            <span className="muted">Disc</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              className={discountInvalid ? 'discount-input discount-input-invalid' : 'discount-input'}
                              value={discount}
                              disabled={isBusy}
                              aria-label={`Discount percent for ${product.name}`}
                              aria-invalid={discountInvalid}
                              onChange={(event) => updateLine(product.id, { discount: event.target.value })}
                            />
                            <span className="muted">%</span>
                          </label>
                        </div>

                        <div className="cart-line-foot">
                          {calc.bonusQty > 0 ? (
                            <span className="bonus-badge">+{calc.bonusQty} Bonus Free</span>
                          ) : product.schemeEnabled ? (
                            <span className="muted cart-line-scheme">
                              {product.schemePurchaseQty}+{product.schemeBonusQty} scheme
                            </span>
                          ) : (
                            <span />
                          )}
                          <span className="cart-line-total">{formatMoney(calc.lineTotal)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="cart-section">
              <dl className="summary-list">
                <div className="summary-row">
                  <dt>Items</dt>
                  <dd>{totals.totalItems}</dd>
                </div>
                <div className="summary-row">
                  <dt>Paid Qty</dt>
                  <dd>{totals.totalPaidQty}</dd>
                </div>
                <div className="summary-row">
                  <dt>Bonus Qty</dt>
                  <dd>{totals.totalBonusQty > 0 ? <span className="bonus-badge">+{totals.totalBonusQty}</span> : 0}</dd>
                </div>
                <div className="summary-row">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(totals.subtotal)}</dd>
                </div>
                <div className="summary-row">
                  <dt>Discount</dt>
                  <dd>{totals.discountTotal > 0 ? `− ${formatMoney(totals.discountTotal)}` : formatMoney(0)}</dd>
                </div>
              </dl>

              <div className="cart-grand-total">
                <span>Grand Total</span>
                <strong>{formatMoney(totals.total)}</strong>
              </div>

              <label className="summary-remarks">
                Remarks
                <textarea
                  rows="2"
                  value={remarks}
                  maxLength={REMARKS_MAX}
                  disabled={isBusy}
                  placeholder="Optional note for this order…"
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </label>

              {validationError && (
                <div className="banner-error" role="alert">
                  {validationError}
                </div>
              )}

              <div className="cart-actions">
                <button type="button" className="btn-secondary" onClick={() => save('draft')} disabled={isBusy}>
                  {saving === 'draft' ? 'Saving…' : isEditing ? 'Save Draft' : 'Save as Draft'}
                </button>
                <button type="button" className="btn-primary" onClick={() => save('submitted')} disabled={isBusy}>
                  {saving === 'submitted' ? 'Submitting…' : 'Submit Order'}
                </button>
              </div>

              <p className="cart-note">
                Bonus quantity is free — added on top of the paid quantity, never taken out of it. Submitting is final:
                a submitted order cannot be edited, only cancelled.
              </p>
            </div>
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
