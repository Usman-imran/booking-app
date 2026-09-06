import { Link } from 'react-router-dom';

// A real 404 for an address that matches nothing. Kept deliberately
// distinct from a "not built yet" message: a mistyped URL is not a missing
// feature, and telling the user to wait for a later stage would be wrong.
export default function NotFound() {
  return (
    <div className="page-placeholder">
      <h2>Page not found</h2>
      <p>That address doesn&apos;t match anything in the application.</p>
      <div className="form-actions">
        <Link to="/" className="btn-secondary">
          Go to Dashboard
        </Link>
        <Link to="/orders/new" className="btn-primary">
          Create Order
        </Link>
      </div>
    </div>
  );
}
