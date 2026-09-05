import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductForm from './ProductForm.jsx';
import { getProduct, updateProduct } from '../../api/products.js';

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getProduct(id)
      .then((data) => {
        if (!cancelled) {
          setProduct(data.product);
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
        <Link to="/products">Back to Products</Link>
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
