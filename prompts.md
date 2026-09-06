Add Dynamic Company Branding based on User Signup details:

1. Database & Auth Updates:
   - Update `users` table schema to include a `company_name` column (string/text).
   - Update Signup/Registration endpoint (`POST /api/auth/register` or user creation) to require `company_name`.
   - Include `company_name` in the user's profile/auth payload and JWT token / AuthContext so it is available globally across the frontend.

2. Frontend Navigation & App Header (`src/components/Layout.jsx`):
   - Display the logged-in user's `company_name` at the top bar or sidebar header instead of a generic title.

3. Order Receipt / Share Template Customization (`src/components/orders/OrderReceiptModal.jsx`):
   - Replace the generic "Medicine Order Booking App" heading in the receipt template with the logged-in user's dynamic `company_name`.
   - If `company_name` is empty/missing for any reason, fall back gracefully to "Medicine Distribution".