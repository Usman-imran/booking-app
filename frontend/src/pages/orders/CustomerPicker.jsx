import { useCallback, useEffect, useRef, useState } from 'react';
import { listCustomers } from '../../api/customers.js';

const RESULT_LIMIT = 8;

// Step 1 of the order flow (PROJECT_SPEC.md §10): pick the customer.
//
// A searchable dropdown rather than a plain <select>: a distributor's
// customer list is far too long to scroll, and customer search has to be
// fast (PROJECT_SPEC.md §25). Typing filters on name or code, arrow keys
// move through the matches, and Enter picks one — so the whole step can be
// done without touching the mouse.
//
// Only active customers are offered, because the API refuses to book an
// order for an inactive one.
export default function CustomerPicker({ value, onChange, disabled }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  // Guards against a slow earlier response landing after a newer one and
  // overwriting the list the booker is actually looking at.
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const fetchCustomers = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setStatus('loading');
    setError(null);
    try {
      const data = await listCustomers({ search, isActive: 'true', limit: RESULT_LIMIT, page: 1 });
      if (requestRef.current !== requestId) return;
      setResults(data.customers);
      setHighlighted(0);
      setStatus('ready');
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setError(err.message);
      setStatus('error');
    }
  }, [search]);

  useEffect(() => {
    if (!isOpen) return;
    fetchCustomers();
  }, [isOpen, fetchCustomers]);

  // Close when the click lands anywhere outside the picker.
  useEffect(() => {
    if (!isOpen) return undefined;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  function select(customer) {
    onChange(customer);
    setIsOpen(false);
    setInput('');
    setSearch('');
  }

  function startChanging() {
    onChange(null);
    setIsOpen(true);
    // Let the input mount before focusing it.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlighted((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = results[highlighted];
      if (choice) select(choice);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  if (value) {
    return (
      <div className="selected-customer">
        <div>
          <div className="selected-customer-name">
            {value.name} <span className="muted">({value.code})</span>
          </div>
          <div className="muted selected-customer-meta">
            {[value.contactPerson, value.phone, value.cityArea, value.address].filter(Boolean).join(' · ') ||
              'No contact details on file'}
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={startChanging} disabled={disabled}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="combobox" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search customers by name or code…"
        value={input}
        disabled={disabled}
        onChange={(event) => {
          setInput(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="customer-options"
        aria-autocomplete="list"
      />

      {isOpen && (
        <ul className="combobox-list" id="customer-options" role="listbox">
          {status === 'loading' && <li className="combobox-message">Searching…</li>}

          {status === 'error' && (
            <li className="combobox-message">
              Could not load customers: {error}{' '}
              <button type="button" className="link-button" onClick={fetchCustomers}>
                Retry
              </button>
            </li>
          )}

          {status === 'ready' && results.length === 0 && (
            <li className="combobox-message">
              {search ? `No active customer matches “${search}”.` : 'No active customers yet.'}
            </li>
          )}

          {status === 'ready' &&
            results.map((customer, index) => (
              <li key={customer.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  className={index === highlighted ? 'combobox-option highlighted' : 'combobox-option'}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => select(customer)}
                >
                  <span className="combobox-option-title">{customer.name}</span>
                  <span className="muted">
                    {customer.code}
                    {customer.cityArea ? ` · ${customer.cityArea}` : ''}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
