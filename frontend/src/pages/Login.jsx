import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getRegistrationStatus } from '../api/auth.js';

export default function Login() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Only offered on a fresh installation. After the first account exists
  // the endpoint refuses anonymous callers, so a permanent link here
  // would lead somewhere that cannot work.
  const [canRegister, setCanRegister] = useState(false);

  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    let cancelled = false;
    getRegistrationStatus()
      .then((data) => {
        if (!cancelled) setCanRegister(data.open);
      })
      // A failure here costs only the link; the sign-in form still works.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Already signed in (e.g. navigated back to /login manually) — bounce away.
  useEffect(() => {
    if (!isLoading && user) {
      navigate(from, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Order Booking</h1>
        <p className="login-subtitle">Sign in to continue</p>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>

        {canRegister && (
          <Link to="/signup" className="signup-link">
            First time here? Set up your company
          </Link>
        )}
      </form>
    </div>
  );
}
