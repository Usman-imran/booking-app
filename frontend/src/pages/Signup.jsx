import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRegistrationStatus, register } from '../api/auth.js';
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

// Account creation.
//
// The page serves the two cases the API allows, and says which one it is in
// rather than presenting one form that sometimes fails:
//
//   * FIRST RUN — no users exist yet. Anyone can create the account that
//     names the business, and is signed straight in.
//   * ADDING A COLLEAGUE — a signed-in booker creates another account. The
//     new account's session is deliberately NOT adopted; switching the
//     current booker into it would be a surprising way to log them out.
//
// Anyone else is told to sign in first, because the API will refuse them.
export default function Signup() {
  const { user, isLoading, adoptSession } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(null); // null while unknown
  const [statusError, setStatusError] = useState(null);
  const [values, setValues] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Signed in already means this is a booker adding a colleague, not
  // someone setting the business up.
  const isAddingColleague = Boolean(user);

  useEffect(() => {
    let cancelled = false;
    getRegistrationStatus()
      .then((data) => {
        if (!cancelled) setIsOpen(data.open);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatusError(err.message);
          setIsOpen(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      if (isAddingColleague) {
        // Stay signed in as the current booker.
        setCreated(data.user);
        setValues(EMPTY_FORM);
      } else {
        adoptSession(data.token, data.user);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || isOpen === null) {
    return (
      <div className="login-page">
        <div className="login-card">Loading…</div>
      </div>
    );
  }

  // Not signed in, and the business already has an account: the API would
  // refuse this, so say so instead of showing a form that can't succeed.
  if (!isOpen && !isAddingColleague) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Accounts are already set up</h1>
          <p className="login-subtitle">
            This installation already has at least one booker, so new accounts are added from inside the app. Sign in
            first, then come back here to add a colleague.
          </p>
          {statusError && (
            <div className="login-error" role="alert">
              Could not check registration status: {statusError}
            </div>
          )}
          <Link to="/login" className="btn-primary signup-block-action">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card login-card-wide" onSubmit={handleSubmit}>
        <h1>{isAddingColleague ? 'Add a booker' : 'Create your account'}</h1>
        <p className="login-subtitle">
          {isAddingColleague
            ? 'The new booker can sign in immediately and has the same access you do — there are no roles in this application.'
            : 'This is the first account. Your company name brands the app and every order receipt it prints.'}
        </p>

        {created && (
          <div className="signup-success" role="status">
            <strong>{created.name}</strong> can now sign in as <strong>{created.username}</strong>.
          </div>
        )}

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
          {isSubmitting ? 'Creating…' : isAddingColleague ? 'Create booker' : 'Create account'}
        </button>

        <Link to={isAddingColleague ? '/' : '/login'} className="signup-link">
          {isAddingColleague ? 'Back to the dashboard' : 'I already have an account'}
        </Link>
      </form>
    </div>
  );
}
