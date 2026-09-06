import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listProducts } from '../../api/products.js';
import { formatScheme } from '../products/schemeFormat.js';

const PAGE_SIZE = 20;

// One manufacturer's catalogue.
//
// Shows ACTIVE products only, so the table always agrees with the count on
// the company's card — a product that vanished from here has been
// deactivated, and is still reachable from the Products page.
//
// The company is filtered server-side by exact name, not by the partial
// search the Products page uses, so browsing "GSK" can never pull in "GSK
// Consumer".
export default function CompanyProducts() {
  const { companyName } = useParams();
  // Route params arrive percent-decoded, so this is the real manufacturer
  // name as stored on the products.
  const company = companyName;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

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
      const data = await listProducts({ page, limit: PAGE_SIZE, search, company, isActive: 'true' });

      // A filter change can leave `page` past the new last page; snap back
      // rather than stranding the table on an empty "no results" view.
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
  }, [company, page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div>
      <div className="page-header">
        <h2>{company}</h2>
        <div className="header-actions">
          <Link to="/companies" className="btn-secondary">
            Back to Companies
          </Link>
          <Link to="/products/new" className="btn-primary">
            Add Product
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          placeholder={`Search within ${company}…`}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        {status === 'ready' && (
          <span className="toolbar-hint">
            {pagination.total} active product{pagination.total === 1 ? '' : 's'}
            {search ? ' matching your search' : ''}
          </span>
        )}
      </div>

      {status === 'loading' && <div className="page-placeholder">Loading products…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load products: {error}</p>
          <div className="form-actions">
            <Link to="/companies" className="btn-secondary">
              Back to Companies
            </Link>
            <button type="button" className="btn-primary" onClick={fetchProducts}>
              Retry
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && products.length === 0 && (
        <div className="page-placeholder">
          {search ? (
            `No active product from ${company} matches your search.`
          ) : (
            <>
              {company} has no active products. They may have been deactivated — look on the{' '}
              <Link to="/products">Products page</Link>, which shows inactive products too.
            </>
          )}
        </div>
      )}

      {status === 'ready' && products.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Code</th>
                  <th className="numeric">MRP</th>
                  <th className="numeric">Sale Price</th>
                  <th className="numeric">Discount</th>
                  <th>Bonus Scheme</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <Link to={`/products/${product.id}`}>{product.name}</Link>
                    </td>
                    <td>{product.code}</td>
                    <td className="numeric">{product.mrp.toFixed(2)}</td>
                    <td className="numeric">{product.salePrice.toFixed(2)}</td>
                    <td className="numeric">{product.discount.toFixed(2)}%</td>
                    <td>{formatScheme(product)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.totalPages > 1 && (
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
          )}
        </>
      )}
    </div>
  );
}
