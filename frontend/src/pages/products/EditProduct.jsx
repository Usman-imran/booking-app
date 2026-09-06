import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductForm from './ProductForm.jsx';
import { getProduct, updateProduct } from '../../api/products.js';

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  // Lifted out of the effect so the error state can offer a Retry rather
  // than leaving a browser reload as the only way forward.
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

  async function handleSubmit(values) {
    await updateProduct(id, values);
    navigate(`/products/${id}`, { replace: true });
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
        <h2>Edit Product</h2>
      </div>
      <ProductForm
        initialValues={{
          name: product.name,
          code: product.code,
          company: product.company || '',
          packing: product.packing || '',
          unit: product.unit || '',
          mrp: String(product.mrp),
          salePrice: String(product.salePrice),
          discount: String(product.discount),
          schemeEnabled: product.schemeEnabled,
          schemePurchaseQty: product.schemePurchaseQty !== null ? String(product.schemePurchaseQty) : '',
          schemeBonusQty: product.schemeBonusQty !== null ? String(product.schemeBonusQty) : '',
        }}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/products/${id}`)}
      />
    </div>
  );
}
