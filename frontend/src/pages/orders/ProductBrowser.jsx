import { useCallback, useEffect, useRef, useState } from 'react';
import { listProductCompanies, listProducts } from '../../api/products.js';
import { formatScheme } from '../products/schemeFormat.js';
import { formatMoney } from './orderCalc.js';

const RESULT_LIMIT = 12;

// The left half of Create Order: find a product and add it.
//
// Built for speed, because this is the screen a booker spends their day in
// (PROJECT_SPEC.md §25). The search box takes focus on arrival, the list is
// already populated before anything is typed, and the whole flow works from
// the keyboard: type, arrow down, Enter, type again. Nothing here requires
// the mouse.
export default function ProductBrowser({ cartQuantities, onAdd, disabled, limitReached }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState([]);

  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [highlighted, setHighlighted] = useState(0);

  const searchRef = useRef(null);
  const listRef = useRef(null);
  const requestRef = useRef(0);

  // Straight into the search box: the first thing a booker does on this
  // screen is type a product name.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  // The company filter's options. A failure costs only this one filter.
  useEffect(() => {
    let cancelled = false;
    listProductCompanies()
      .then((data) => {
        if (!cancelled) setCompanies(data.companies);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchProducts = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setStatus('loading');
    setError(null);
    try {
      const data = await listProducts({
        search,
        company: company || undefined,
        isActive: 'true',
        limit: RESULT_LIMIT,
        page: 1,
      });
      // Ignore a slow response that a newer search has already superseded.
      if (requestRef.current !== requestId) return;
      setProducts(data.products);
      setHighlighted(0);
      setStatus('ready');
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err.message);
      setStatus('error');
    }
  }, [search, company]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Keeps the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-highlighted="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  function add(product) {
    if (disabled || limitReached || !product) return;
    onAdd(product);
    // The search stays as it is: adding several strengths of the same
    // medicine is common, and clearing it would mean retyping.
    searchRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, products.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      add(products[highlighted]);
    } else if (event.key === 'Escape') {
      setInput('');
    }
  }

  const hasFilters = Boolean(search || company);

  return (
    <div className="browser">
      <div className="browser-controls">
        <input
          ref={searchRef}
          type="text"
          className="browser-search"
          placeholder="Search products by name, code or company…"
          value={input}
          disabled={disabled}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search products"
        />
        <select
          className="browser-filter"
          value={company}
          disabled={disabled}
          onChange={(event) => setCompany(event.target.value)}
          aria-label="Filter by company"
        >
          <option value="">All companies</option>
          {companies.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <p className="browser-hint">
        <kbd>↑</kbd> <kbd>↓</kbd> to move, <kbd>Enter</kbd> to add. Keep typing to add the next product.
      </p>

      {limitReached && (
        <div className="banner-error" role="alert">
          An order can hold at most 200 products. Remove a line before adding another.
        </div>
      )}

      {status === 'loading' && <div className="browser-message">Searching…</div>}

      {status === 'error' && (
        <div className="browser-message">
          Could not load products: {error}{' '}
          <button type="button" className="link-button" onClick={fetchProducts}>
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && products.length === 0 && (
        <div className="browser-message">
          {hasFilters ? 'No active product matches this search.' : 'No active products yet.'}
        </div>
      )}

      {status === 'ready' && products.length > 0 && (
        <ul className="browser-list" ref={listRef}>
          {products.map((product, index) => {
            const inCart = cartQuantities.get(product.id) ?? 0;
            return (
              <li
                key={product.id}
                data-highlighted={index === highlighted}
                className={index === highlighted ? 'browser-item is-highlighted' : 'browser-item'}
                onMouseEnter={() => setHighlighted(index)}
              >
                <div className="browser-item-main">
                  <div className="browser-item-name">
                    {product.name}
                    {inCart > 0 && <span className="browser-in-cart">{inCart} in order</span>}
                  </div>
                  <div className="browser-item-meta">
                    {product.code}
                    {product.packing ? ` · ${product.packing}` : ''}
                    {product.unit ? ` · ${product.unit}` : ''}
                    {product.company ? ` · ${product.company}` : ''}
                  </div>
                </div>

                <div className="browser-item-price">
                  <div className="browser-item-rate">{formatMoney(product.salePrice)}</div>
                  {product.discount > 0 && (
                    <div className="browser-item-discount">{formatMoney(product.discount)}% off</div>
                  )}
                </div>

                <div className="browser-item-scheme">
                  {product.schemeEnabled ? (
                    <span className="scheme-badge">{formatScheme(product)}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-primary btn-compact"
                  disabled={disabled || limitReached}
                  onClick={() => add(product)}
                >
                  Add
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
