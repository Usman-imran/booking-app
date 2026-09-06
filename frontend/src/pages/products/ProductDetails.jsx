import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deactivateProduct, getProduct, updateProduct } from '../../api/products.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatScheme } from './schemeFormat.js';

export default function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchProduct = useCallback(() => {
    setStatus('loading');
    setError(null);
    return getProduct(id)
      .then((data) => {
        setProduct(data.product);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err.message);
        setStatus('error');
      });
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  async function handleConfirmToggle() {
    setIsMutating(true);
    setActionError(null);
    try {
      if (product.isActive) {
        await deactivateProduct(id);
      } else {
        await updateProduct(id, { isActive: true });
      }
      setConfirmOpen(false);
      await fetchProduct();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  if (status === 'loading') {
    return <div className="page-placeholder">Loading product…</div>;
  }

  if (status === 'error') {
    return (
      <div className="page-placeholder">
        <p>Could not load product: {error}</p>
        <div className="form-actions">
          <Link to="/products" className="btn-secondary">
            Back to Products
          </Link>
          <button type="button" className="btn-primary" onClick={fetchProduct}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          {product.name}{' '}
          <span className={`status-badge ${product.isActive ? 'status-active' : 'status-inactive'}`}>
            {product.isActive ? 'Active' : 'Inactive'}
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
            <dt>Product Code</dt>
            <dd>{product.code}</dd>
          </div>
          <div>
            <dt>Company/Manufacturer</dt>
            <dd>{product.company || '—'}</dd>
          </div>
          <div>
            <dt>Packing</dt>
            <dd>{product.packing || '—'}</dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{product.unit || '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="detail-card">
        <h3 className="form-section-title">Pricing</h3>
        <dl className="detail-grid">
          <div>
            <dt>MRP</dt>
            <dd>{product.mrp.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Sale Price</dt>
            <dd>{product.salePrice.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{product.discount.toFixed(2)}%</dd>
          </div>
        </dl>
      </div>

      <div className="detail-card">
        <h3 className="form-section-title">Bonus Scheme</h3>
        {product.schemeEnabled ? (
          <dl className="detail-grid">
            <div>
              <dt>Status</dt>
              <dd>Enabled</dd>
            </div>
            <div>
              <dt>Scheme</dt>
              <dd className="scheme-highlight">{formatScheme(product)}</dd>
            </div>
            <div>
              <dt>Purchase Quantity</dt>
              <dd>{product.schemePurchaseQty}</dd>
            </div>
            <div>
              <dt>Bonus Quantity</dt>
              <dd>{product.schemeBonusQty}</dd>
            </div>
          </dl>
        ) : (
          <p>No bonus scheme configured for this product.</p>
        )}
      </div>

      <div className="form-actions">
        <Link to="/products" className="btn-secondary">
          Back to Products
        </Link>
        <Link to={`/products/${id}/edit`} className="btn-secondary">
          Edit
        </Link>
        <button type="button" className="btn-danger" onClick={() => setConfirmOpen(true)}>
          {product.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={product.isActive ? 'Deactivate product?' : 'Reactivate product?'}
        message={
          product.isActive
            ? `${product.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
            : `${product.name} will be marked active again.`
        }
        confirmLabel={product.isActive ? 'Deactivate' : 'Reactivate'}
        isLoading={isMutating}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
