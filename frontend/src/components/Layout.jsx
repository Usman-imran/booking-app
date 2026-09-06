import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Customers' },
  { to: '/products', label: 'Products' },
  { to: '/companies', label: 'Companies' },
  { to: '/orders/new', label: 'Create Order' },
  { to: '/orders/drafts', label: 'Draft Orders' },
  { to: '/orders', label: 'Orders' },
  { to: '/reports', label: 'Sales Reports' },
  { to: '/targets', label: 'Targets' },
  // Application-level configuration only (PROJECT_SPEC.md §24), so it sits
  // apart from the business modules above it.
  { to: '/settings', label: 'Settings' },
];

// The sidebar is headed with the distribution business the signed-in booker
// works for, not a product name. Falls back while the session is still
// loading, or for accounts created before company names existed.
const FALLBACK_BRAND = 'Medicine Distribution';

export default function Layout() {
  const { user, logout } = useAuth();
  const brand = user?.companyName?.trim() || FALLBACK_BRAND;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 title={brand}>{brand}</h1>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-user">{user?.name}</span>
          <button type="button" className="logout-button" onClick={logout}>
            Logout
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
