import { useRef, useState } from 'react';
import { bulkUploadProducts, downloadProductTemplate, validateProductImport } from '../../api/products.js';

const ACCEPTED = '.xlsx,.xls,.csv';
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_BYTES = 5 * 1024 * 1024;

// Mirrors the server's column rules so the modal can state them up front,
// rather than leaving the user to discover them from error messages.
const REQUIRED_COLUMNS = ['Product Name', 'Sale Price'];
const OPTIONAL_COLUMNS = [
  ['Product Code', 'matches an existing product, or is generated (PROD-0001…) if blank'],
  ['MRP', 'new: 0 · existing: unchanged'],
  ['Discount', 'new: 0 · existing: unchanged'],
  ['Scheme Purchase Qty', 'above 0 creates a scheme · blank leaves an existing one alone'],
  ['Scheme Bonus Qty', 'new: 0 · existing: unchanged'],
  ['Company, Packing, Unit', 'new: empty · existing: unchanged'],
];

function isAcceptedFile(file) {
  const name = (file?.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// New vs existing is the thing a booker most needs to see before importing:
// it is the difference between adding a supplier's catalogue and rewriting
// the prices of products already in use.
function Breakdown({ summary }) {
  return (
    <div className="import-breakdown">
      <div className="import-breakdown-item">
        <span className="import-breakdown-value">{summary.totalRows}</span>
        <span className="import-breakdown-label">Rows processed</span>
      </div>
      <div className="import-breakdown-item">
        <span className="import-breakdown-value">{summary.newProducts}</span>
        <span className="import-breakdown-label">New products to add</span>
      </div>
      <div className="import-breakdown-item">
        <span className="import-breakdown-value">{summary.updatedProducts}</span>
        <span className="import-breakdown-label">Existing to update</span>
      </div>
      {summary.invalidRows > 0 && (
        <div className="import-breakdown-item import-breakdown-bad">
          <span className="import-breakdown-value">{summary.invalidRows}</span>
          <span className="import-breakdown-label">Rows with problems</span>
        </div>
      )}
    </div>
  );
}

// Lists exactly which existing products an import would change, so an
// update is never a surprise — a name typo silently rewriting the wrong
// product is the main risk of matching by name.
function UpdateTable({ updates }) {
  return (
    <details className="import-updates">
      <summary>
        {updates.length} existing product{updates.length === 1 ? '' : 's'} will be updated — see which
      </summary>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Code</th>
              <th>Existing product</th>
              <th>Matched by</th>
            </tr>
          </thead>
          <tbody>
            {updates.map((update) => (
              <tr key={`${update.row}-${update.code}`}>
                <td>{update.row}</td>
                <td>{update.code}</td>
                <td>{update.name}</td>
                <td>{update.matchedBy === 'code' ? 'Product Code' : 'Product Name'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ErrorTable({ errors }) {
  return (
    <div className="import-failures">
      <h4>
        {errors.length} problem{errors.length === 1 ? '' : 's'} to fix
      </h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Column</th>
              <th>Problem</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((issue, index) => (
              <tr key={`${issue.row}-${issue.field}-${index}`}>
                <td>{issue.row}</td>
                <td>{issue.field}</td>
                <td className="import-error-message">{issue.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="picker-note">Row numbers match the rows in your spreadsheet.</p>
    </div>
  );
}

// Bulk product import, in two deliberate steps: test the file, then import
// it. Importing is all-or-nothing on the server, so the Import button stays
// disabled until a validation pass comes back completely clean — the user
// never fires an upload that is going to be refused.
//
// The import is an UPSERT: a row matching a product that already exists
// updates it rather than creating a duplicate. Because that can rewrite
// products already being ordered, the validation step shows the new/updated
// split up front and can list exactly which existing products would change.
//
// Re-validating is forced whenever the file changes, so the enabled Import
// button can only ever refer to the file that was actually checked.
export default function ImportProductsModal({ open, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  // 'idle' | 'validating' | 'importing'
  const [busy, setBusy] = useState('idle');
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [imported, setImported] = useState(null);

  const inputRef = useRef(null);

  if (!open) return null;

  function resetAll() {
    setFile(null);
    setValidation(null);
    setImported(null);
    setError(null);
    setBusy('idle');
    if (inputRef.current) inputRef.current.value = '';
  }

  function selectFile(nextFile) {
    // Any new file invalidates a previous pass — the Import button must
    // never be enabled for a file nobody checked.
    setError(null);
    setValidation(null);
    setImported(null);

    if (!nextFile) return;
    if (!isAcceptedFile(nextFile)) {
      setError(`Choose a ${ACCEPTED_EXTENSIONS.join(', ')} file.`);
      setFile(null);
      return;
    }
    if (nextFile.size > MAX_BYTES) {
      setError(`That file is ${formatSize(nextFile.size)} — the limit is 5 MB.`);
      setFile(null);
      return;
    }
    setFile(nextFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  async function handleDownloadTemplate() {
    setError(null);
    try {
      const blob = await downloadProductTemplate();
      // The endpoint needs the auth token, so the file is fetched and then
      // handed to the browser as an object URL rather than linked directly.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'product-import-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Could not download the template: ${err.message}`);
    }
  }

  async function handleValidate() {
    if (!file) return;
    setBusy('validating');
    setError(null);
    setImported(null);
    try {
      setValidation(await validateProductImport(file));
    } catch (err) {
      // A file that can't be read at all fails with a plain message rather
      // than row-level errors.
      setError(err.message);
      setValidation(null);
    } finally {
      setBusy('idle');
    }
  }

  async function handleImport() {
    if (!file || !validation?.isValid) return;
    setBusy('importing');
    setError(null);
    try {
      const data = await bulkUploadProducts(file);
      setImported(data);
      setValidation(null);
      onImported();
    } catch (err) {
      // The server re-checks every row, so an import can still be refused
      // if the catalogue changed between validating and importing — a
      // code claimed by someone else, say. Show that as a fresh result.
      if (err.body?.errors) {
        setValidation({ ...err.body, isValid: false });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy('idle');
    }
  }

  const isBusy = busy !== 'idle';
  const canValidate = Boolean(file) && !isBusy;
  const canImport = Boolean(file) && validation?.isValid === true && !isBusy;

  return (
    <div className="dialog-overlay" onClick={isBusy ? undefined : onClose}>
      <div
        className="dialog-card dialog-card-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Import products"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Import Products</h3>

        <div className="import-columns">
          <div>
            <span className="import-columns-label import-columns-required">Required</span>
            <ul>
              {REQUIRED_COLUMNS.map((column) => (
                <li key={column}>{column}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="import-columns-label">Optional</span>
            <ul>
              {OPTIONAL_COLUMNS.map(([column, behaviour]) => (
                <li key={column}>
                  {column} <span className="muted">— {behaviour}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button type="button" className="btn-secondary btn-compact" onClick={handleDownloadTemplate}>
          Download Sample Template
        </button>

        <div
          className={isDragging ? 'dropzone is-dragging' : 'dropzone'}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="dropzone-input"
            disabled={isBusy}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          {file ? (
            <>
              <div className="dropzone-file">{file.name}</div>
              <div className="muted">{formatSize(file.size)}</div>
              <button
                type="button"
                className="link-button"
                disabled={isBusy}
                onClick={() => {
                  setFile(null);
                  setValidation(null);
                  setImported(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                Choose a different file
              </button>
            </>
          ) : (
            <>
              <div className="dropzone-file">Drag a file here, or click to choose</div>
              <div className="muted">.xlsx, .xls or .csv — up to 5 MB, 1000 rows</div>
            </>
          )}
        </div>

        {error && (
          <div className="banner-error" role="alert">
            {error}
          </div>
        )}

        {busy === 'validating' && (
          <div className="banner-info" role="status">
            Checking every row…
          </div>
        )}
        {busy === 'importing' && (
          <div className="banner-info" role="status">
            Importing…
          </div>
        )}

        {validation?.isValid && (
          <>
            <div className="banner-success import-verdict" role="status">
              <span className="import-tick" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>File looks good.</strong> Nothing has been saved yet — press Import Products to apply it.
                {validation.summary.generatedCodes > 0
                  ? ` ${validation.summary.generatedCodes} product code${
                      validation.summary.generatedCodes === 1 ? ' will be' : 's will be'
                    } generated automatically.`
                  : ''}
              </span>
            </div>
            <Breakdown summary={validation.summary} />
            {validation.updates?.length > 0 && <UpdateTable updates={validation.updates} />}
          </>
        )}

        {validation && validation.isValid === false && (
          <>
            <div className="banner-error" role="alert">
              <strong>This file can&apos;t be imported yet.</strong> {validation.summary.invalidRows} of{' '}
              {validation.summary.totalRows} rows need fixing. Nothing has been saved.
            </div>
            <Breakdown summary={validation.summary} />
          </>
        )}

        {validation?.unmappedHeaders?.length > 0 && (
          <div className="banner-info">
            These columns weren&apos;t recognised and will be ignored: {validation.unmappedHeaders.join(', ')}. Check
            the spelling against the template if you expected them to be imported.
          </div>
        )}

        {imported && (
          <>
            <div className="banner-success import-verdict" role="status">
              <span className="import-tick" aria-hidden="true">
                ✓
              </span>
              <span>{imported.message}</span>
            </div>
            <Breakdown summary={imported.summary} />
          </>
        )}

        {validation?.errors?.length > 0 && <ErrorTable errors={validation.errors} />}

        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>
            {imported ? 'Close' : 'Cancel'}
          </button>

          {imported ? (
            <button type="button" className="btn-primary" onClick={resetAll}>
              Import Another File
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={handleValidate} disabled={!canValidate}>
                {busy === 'validating' ? 'Checking…' : '1. Test / Validate File'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleImport}
                disabled={!canImport}
                title={canImport ? undefined : 'Validate the file first — it must pass with no problems.'}
              >
                {busy === 'importing' ? 'Importing…' : '2. Upload / Import Products'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
