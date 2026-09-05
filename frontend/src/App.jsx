import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import PagePlaceholder from './components/PagePlaceholder.jsx';
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

export default function App() {
  return (
    <AuthProvider>
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
            <Route path="/prices" element={<PagePlaceholder title="Prices" />} />
            <Route path="/orders/new" element={<PagePlaceholder title="Create Order" />} />
            <Route path="/orders/drafts" element={<PagePlaceholder title="Draft Orders" />} />
            <Route path="/orders" element={<PagePlaceholder title="Orders" />} />
            <Route path="/reports" element={<PagePlaceholder title="Sales Reports" />} />
            <Route path="/targets" element={<PagePlaceholder title="Targets" />} />
            <Route path="*" element={<PagePlaceholder title="Page Not Found" />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
