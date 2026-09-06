import { useCallback, useEffect, useRef, useState } from 'react';
import { listProducts } from '../../api/products.js';
import { formatScheme } from '../products/schemeFormat.js';
import { formatMoney } from './orderCalc.js';

const RESULT_LIMIT = 8;

// Steps 2-3 of the order flow (PROJECT_SPEC.md §10): find a product and add
// it to the order.
//
// Product search has to be fast (PROJECT_SPEC.md §25), so the table is
// always on screen — pre-loaded with the first products before anything is
// typed — and pressing Enter in the search box adds the top match without
// reaching for the mouse. Each row shows the rate, discount and scheme that
// will apply, so the booker can see what they're adding before they add it.
//
// Only active products are offered; the API refuses to order a deactivated
// one.
export default function ProductPicker({ addedProductIds, onAdd, disabled, limitReached }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const fetchProducts = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setStatus('loading');
    setError(null);
    try {
      const data = await listProducts({ search, isActive: 'true', limit: RESULT_LIMIT, page: 1 });
      // Ignore a stale response that arrived after a newer search.
      if (requestRef.current !== requestId) return;
      setResults(data.products);
      setStatus('ready');
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err.message);
      setStatus('error');
    }
  }, [search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function handleKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (disabled || limitReached) return;
    const first = results[0];
    if (first) onAdd(first);
  }

  return (
    <div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search products by name, code or company…"
          value={input}
          disabled={disabled}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span className="toolbar-hint">Press Enter to add the first match.</span>
      </div>

      {limitReached && (
        <div className="banner-error" role="alert">
          An order can hold at most 200 products. Remove a line before adding another.
        </div>
      )}

      {status === 'loading' && <div className="picker-message">Searching products…</div>}

      {status === 'error' && (
        <div className="picker-message">
          Could not load products: {error}{' '}
          <button type="button" className="link-button" onClick={fetchProducts}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && results.length === 0 && (
        <div className="picker-message">
          {search ? `No active product matches “${search}”.` : 'No active products yet. Add products first.'}
        </div>
      )}

      {status === 'ready' && results.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Code</th>
                <th>Company</th>
                <th>Packing</th>
                <th className="numeric">MRP</th>
                <th className="numeric">Rate</th>
                <th className="numeric">Discount</th>
                <th>Scheme</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((product) => {
                const alreadyAdded = addedProductIds.has(product.id);
                return (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.code}</td>
                    <td>{product.company || '—'}</td>
                    <td>{product.packing || '—'}</td>
                    <td className="numeric">{formatMoney(product.mrp)}</td>
                    <td className="numeric">{formatMoney(product.salePrice)}</td>
                    <td className="numeric">{formatMoney(product.discount)}%</td>
                    <td>{formatScheme(product)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary btn-compact"
                        onClick={() => onAdd(product)}
                        disabled={disabled || limitReached}
                      >
                        {alreadyAdded ? 'Add again' : 'Add'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
