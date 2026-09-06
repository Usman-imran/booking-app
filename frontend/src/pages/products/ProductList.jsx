import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deactivateProduct, listProducts, updateProduct } from '../../api/products.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import ImportProductsModal from './ImportProductsModal.jsx';
import { formatScheme } from './schemeFormat.js';

const PAGE_SIZE = 20;

export default function ProductList() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const [isImportOpen, setIsImportOpen] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Debounce free-text search so we don't fire a request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchProducts = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listProducts({ page, limit: PAGE_SIZE, search, isActive: statusFilter || undefined });

      // A mutation (e.g. deactivating the last row on this page) or a
      // filter change can leave `page` pointing past the new last page.
      // Snap back instead of showing a misleading "no results" state
      // with no pagination controls to escape it.
      if (data.products.length === 0 && page > data.pagination.totalPages) {
        setPage(data.pagination.totalPages);
        return;
      }

      setProducts(data.products);
      setPagination(data.pagination);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function handleFilterChange(event) {
    setStatusFilter(event.target.value);
    setPage(1);
  }

  async function confirmToggleStatus() {
    if (!confirmTarget) return;
    setIsMutating(true);
    setActionError(null);
    try {
      if (confirmTarget.isActive) {
        await deactivateProduct(confirmTarget.id);
      } else {
        await updateProduct(confirmTarget.id, { isActive: true });
      }
      setConfirmTarget(null);
      await fetchProducts();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsMutating(false);
    }
  }

  const hasFilters = Boolean(search || statusFilter);

  return (
    <div>
      <div className="page-header">
        <h2>Products</h2>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={() => setIsImportOpen(true)}>
            Import Products
          </button>
          <Link to="/products/new" className="btn-primary">
            Add Product
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder="Search by name, code or company…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <select value={statusFilter} onChange={handleFilterChange}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {actionError && (
        <div className="banner-error" role="alert">
          {actionError}
        </div>
      )}

      {status === 'loading' && <div className="page-placeholder">Loading products…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load products: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchProducts}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && products.length === 0 && (
        <div className="page-placeholder">
          {hasFilters ? 'No products match your search/filter.' : 'No products yet. Add your first product to get started.'}
        </div>
      )}

      {status === 'ready' && products.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Company</th>
                  <th>MRP</th>
                  <th>Sale Price</th>
                  <th>Discount</th>
                  <th>Scheme</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <Link to={`/products/${product.id}`}>{product.name}</Link>
                    </td>
                    <td>{product.code}</td>
                    <td>{product.company || '—'}</td>
                    <td>{product.mrp.toFixed(2)}</td>
                    <td>{product.salePrice.toFixed(2)}</td>
                    <td>{product.discount.toFixed(2)}%</td>
                    <td>{formatScheme(product)}</td>
                    <td>
                      <span className={`status-badge ${product.isActive ? 'status-active' : 'status-inactive'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="row-actions">
                      <Link to={`/products/${product.id}/edit`}>Edit</Link>
                      <button type="button" onClick={() => setConfirmTarget(product)}>
                        {product.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span>
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="pagination-controls">
              <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <ImportProductsModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        // Refreshed as soon as rows land, so the imported products are on
        // screen the moment the modal closes.
        onImported={() => {
          setPage(1);
          fetchProducts();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={confirmTarget?.isActive ? 'Deactivate product?' : 'Reactivate product?'}
        message={
          confirmTarget?.isActive
            ? `${confirmTarget?.name} will be marked inactive and won't be selectable for new orders. You can reactivate it later.`
            : `${confirmTarget?.name} will be marked active again.`
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate' : 'Reactivate'}
        isLoading={isMutating}
        onConfirm={confirmToggleStatus}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
