import { useNavigate } from 'react-router-dom';
import ProductForm from './ProductForm.jsx';
import { createProduct } from '../../api/products.js';

export default function AddProduct() {
  const navigate = useNavigate();

  async function handleSubmit(values) {
    const { product } = await createProduct(values);
    navigate(`/products/${product.id}`, { replace: true });
  }

  return (
    <div>
      <div className="page-header">
        <h2>Add Product</h2>
      </div>
      <ProductForm submitLabel="Create Product" onSubmit={handleSubmit} onCancel={() => navigate('/products')} />
    </div>
  );
}
