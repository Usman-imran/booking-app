import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCompanies } from '../../api/companies.js';

// Browse products by manufacturer.
//
// Companies aren't an entity in this application — Company is a field on
// the product (PROJECT_SPEC.md §5) and there is deliberately no companies
// table — so this list is derived from the products themselves and stays
// correct on its own as products are added, edited, imported or
// deactivated.
//
// The counts are of ACTIVE products, so a manufacturer whose products have
// all been deactivated drops off the list: it has nothing left to sell.
export default function CompanyList() {
  const [companies, setCompanies] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const fetchCompanies = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await listCompanies();
      setCompanies(data.companies);
      setTotalProducts(data.totalProducts);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Filtered in the browser: the whole list is already here, and it is far
  // too short to be worth a request per keystroke.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((entry) => entry.company.toLowerCase().includes(term));
  }, [companies, search]);

  return (
    <div>
      <div className="page-header">
        <h2>Companies</h2>
        <Link to="/products" className="btn-secondary">
          All Products
        </Link>
      </div>

      {status === 'loading' && <div className="page-placeholder">Loading companies…</div>}

      {status === 'error' && (
        <div className="page-placeholder">
          <p>Could not load companies: {error}</p>
          <button type="button" className="btn-secondary" onClick={fetchCompanies}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && companies.length === 0 && (
        <div className="page-placeholder">
          No companies yet. A company appears here as soon as an active product is assigned to it — set one on a
          product&apos;s form, or fill in the Company column when you <Link to="/products">import products</Link>.
        </div>
      )}

      {status === 'ready' && companies.length > 0 && (
        <>
          <div className="toolbar">
            <input
              type="text"
              placeholder="Search companies…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="toolbar-hint">
              {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} · {totalProducts} active product
              {totalProducts === 1 ? '' : 's'}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="page-placeholder">No company matches “{search}”.</div>
          ) : (
            <div className="company-grid">
              {visible.map((entry) => (
                <Link
                  key={entry.company}
                  // Encoded because a manufacturer name can contain spaces
                  // and punctuation.
                  to={`/companies/${encodeURIComponent(entry.company)}`}
                  className="company-card"
                >
                  <span className="company-card-name">{entry.company}</span>
                  <span className="company-card-count">
                    {entry.productCount} <span className="muted">active product{entry.productCount === 1 ? '' : 's'}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
