import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Customers' },
  { to: '/products', label: 'Products' },
  { to: '/orders/new', label: 'Create Order' },
  { to: '/orders/drafts', label: 'Draft Orders' },
  { to: '/orders', label: 'Orders' },
  { to: '/reports', label: 'Sales Reports' },
  { to: '/targets', label: 'Targets' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Order Booking</h1>
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
