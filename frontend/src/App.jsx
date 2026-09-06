import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import NotFound from './pages/NotFound.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import CustomerList from './pages/customers/CustomerList.jsx';
import AddCustomer from './pages/customers/AddCustomer.jsx';
import EditCustomer from './pages/customers/EditCustomer.jsx';
import CustomerDetails from './pages/customers/CustomerDetails.jsx';
import ProductList from './pages/products/ProductList.jsx';
import AddProduct from './pages/products/AddProduct.jsx';
import EditProduct from './pages/products/EditProduct.jsx';
import ProductDetails from './pages/products/ProductDetails.jsx';
import CreateOrder from './pages/orders/CreateOrder.jsx';
import DraftOrders from './pages/orders/DraftOrders.jsx';
import OrderList from './pages/orders/OrderList.jsx';
import OrderDetails from './pages/orders/OrderDetails.jsx';
import SalesReports from './pages/reports/SalesReports.jsx';
import Targets from './pages/targets/Targets.jsx';

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/customers/new" element={<AddCustomer />} />
              <Route path="/customers/:id/edit" element={<EditCustomer />} />
              <Route path="/customers/:id" element={<CustomerDetails />} />
              <Route path="/products" element={<ProductList />} />
              <Route path="/products/new" element={<AddProduct />} />
              <Route path="/products/:id/edit" element={<EditProduct />} />
              <Route path="/products/:id" element={<ProductDetails />} />
              <Route path="/orders/new" element={<CreateOrder />} />
              <Route path="/orders/drafts" element={<DraftOrders />} />
              {/* Every order — draft, submitted or cancelled — is shown by
                  OrderDetails; the drafts path stays valid as an alias. */}
              <Route path="/orders/drafts/:id" element={<OrderDetails />} />
              {/* Continuing a draft reuses the Create Order screen. */}
              <Route path="/orders/drafts/:id/edit" element={<CreateOrder />} />
              <Route path="/orders" element={<OrderList />} />
              <Route path="/orders/:id" element={<OrderDetails />} />
              <Route path="/reports" element={<SalesReports />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </ErrorBoundary>
    </AuthProvider>
  );
}
