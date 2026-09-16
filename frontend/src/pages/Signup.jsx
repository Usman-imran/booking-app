import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth.js';
import { useAuth } from '../auth/AuthContext.jsx';

const MIN_PASSWORD_LENGTH = 8;

const EMPTY_FORM = {
  companyName: '',
  name: '',
  username: '',
  password: '',
  confirmPassword: '',
  phone: '',
};

// Account creation. Registration is open to anyone, and every account is
// its own private workspace: the customers, products, orders and targets
// created under it are visible to that account alone. A new account is
// signed straight in.
export default function Signup() {
  const { user, isLoading, adoptSession } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in — there is nothing to do here; an account can't add
  // another one (each is fully separate), so bounce to the dashboard.
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

  function handleChange(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  function validate() {
    if (!values.companyName.trim()) return 'Enter your company name — it appears on the app and on order receipts.';
    if (!values.name.trim()) return 'Enter the booker’s full name.';
    if (!values.username.trim()) return 'Choose a username.';
    if (values.password.length < MIN_PASSWORD_LENGTH) {
      return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    // There is no password reset in this application, so a mistyped password
    // on the very first account would lock the business out entirely.
    if (values.password !== values.confirmPassword) return 'The two passwords do not match.';
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await register({
        name: values.name.trim(),
        username: values.username.trim(),
        password: values.password,
        companyName: values.companyName.trim(),
        phone: values.phone.trim() || undefined,
      });

      adoptSession(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Wait for session hydration so a signed-in user is redirected rather
  // than shown a form for a moment.
  if (isLoading || user) {
    return (
      <div className="login-page">
        <div className="login-card">Loading…</div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card login-card-wide" onSubmit={handleSubmit}>
        <h1>Create your account</h1>
        <p className="login-subtitle">
          Your company name brands the app and every order receipt it prints. Everything you add is private to your
          account.
        </p>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="companyName">Company name</label>
        <input
          id="companyName"
          type="text"
          value={values.companyName}
          onChange={handleChange('companyName')}
          placeholder="e.g. Al-Noor Distributors"
          autoComplete="organization"
          autoFocus
          required
        />

        <label htmlFor="name">Full name</label>
        <input
          id="name"
          type="text"
          value={values.name}
          onChange={handleChange('name')}
          autoComplete="name"
          required
        />

        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={values.username}
          onChange={handleChange('username')}
          autoComplete="username"
          required
        />

        <label htmlFor="phone">Contact number (optional)</label>
        <input id="phone" type="tel" value={values.phone} onChange={handleChange('phone')} autoComplete="tel" />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={values.password}
          onChange={handleChange('password')}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />

        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={handleChange('confirmPassword')}
          autoComplete="new-password"
          required
        />

        <p className="signup-note">
          At least {MIN_PASSWORD_LENGTH} characters. There is no password reset in this application, so keep it
          somewhere safe.
        </p>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </button>

        <Link to="/login" className="signup-link">
          I already have an account
        </Link>
      </form>
    </div>
  );
}
