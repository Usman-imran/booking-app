# Medicine Order Booking App

A standalone, open-source order-booking and basic sales-management application for a medicine distribution business.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full product and technical specification. That document is the source of truth for all features and business rules.

## Status

**Stage 1 — Project Foundation: complete.** Project scaffolding, basic routing, the PostgreSQL/migrations foundation, a clean REST API structure with centralized error handling, and a reusable frontend API client are all in place and verified.

**Stage 2 — Authentication & Booker System: complete.** The `users` table exists, the login API (`POST /api/auth/login`, `GET /api/auth/me`) works, and the frontend has a login page that gates every app route: unauthenticated visitors are redirected to `/login`, a session survives a page refresh, invalid/expired/deactivated sessions are rejected, and logout is wired up. There is still no user-management UI/API and no roles/permissions (none are planned — see `PROJECT_SPEC.md` §2).

**Stage 3 — Customers: complete.** The `customers` table exists (see `PROJECT_SPEC.md` §4), a full REST API is available at `/api/customers` (create, list/search/filter/paginate, get, update, deactivate — all behind authentication), and there's a full UI for it: a searchable/filterable/paginated list, add/edit forms, a details view, and deactivate/reactivate with a confirmation dialog. Verified end-to-end from a clean database, including a fix for a pagination edge case (deactivating/reactivating the last row on a page no longer strands the list on an empty "no results" page — it now snaps back to a valid page). Stage 1/2 features (health checks, migrations, login/auth) were re-confirmed unaffected. Order history, total-orders and total-sales still don't appear anywhere — they depend on the Orders module, not built yet.

**Stage 4 — Products & Pricing: complete.** The `products` table exists (see `PROJECT_SPEC.md` §5, §7, §8), a full REST API is available at `/api/products`, and there's a full UI for it: a searchable/filterable/paginated list (with MRP, Sale Price, Discount, and scheme shown per row), add/edit forms with a Pricing section and a Bonus Scheme toggle that shows a live "20 + 2"-style example, a details view, and deactivate/reactivate with a confirmation dialog. Re-verified end-to-end from a clean database, including a fix for a validation gap (explicit `null` for `mrp`/`salePrice`/`discount` was silently coerced to `0` instead of being rejected — a quirk of `Number(null) === 0` in JavaScript). Authentication, Customer, and prior-stage functionality were all re-confirmed unaffected by full regression runs. There is no separate bulk "Prices" page — pricing is managed as part of each product's form, since the step's requirements scoped "Prices" to fields on the product itself; `/prices` in the sidebar remains a placeholder for a possible future bulk-editing screen.

**Stage 5 — Orders: in progress (Step 1 + Order Numbering done).** The `orders` and `order_items` tables exist (see `PROJECT_SPEC.md` §10–§17, §26, §34): an order belongs to a customer and a booker, has a `draft`/`submitted`/`cancelled` status enforced by a DB-level state machine (each status requires an exact, consistent combination of `order_number`/`submitted_at`/`cancelled_at`/`cancelled_by`), and every order item is a full historical snapshot (product name/code, MRP, rate, discount, paid/bonus quantities, the scheme that applied, and the computed line amounts) that a later product/price/discount/scheme change can never alter. The `ORD-YYYYMMDD-XXX` order numbering system (§11) is implemented and tested: `submitOrder()`/`cancelOrder()` in `backend/src/models/order.js`, backed by a concurrency-safe daily counter in `backend/src/utils/orderNumber.js` — see [Order Numbering](#order-numbering) below. No Order API or UI yet — `submitOrder`/`cancelOrder` are model-layer functions only, not exposed as routes.

## Project Structure

```text
order-booking-app/
├── backend/            Node.js + Express API
│   ├── migrations/     PostgreSQL schema migrations (node-pg-migrate)
│   ├── src/
│   │   ├── config/     Configuration (PostgreSQL pool, connection test)
│   │   ├── middleware/ Centralized error/404 handling, JWT authentication
│   │   ├── models/     Plain SQL data-access functions (user.js, customer.js, product.js, order.js, orderItem.js)
│   │   ├── routes/     Express route modules (index.js aggregates them under /api)
│   │   ├── utils/      ApiError, asyncHandler, password hashing, JWT signing, order numbering
│   │   ├── app.js      Express app setup
│   │   └── server.js   Entry point
│   ├── .node-pg-migraterc
│   └── .env.example
├── frontend/           React app (Vite)
│   ├── src/
│   │   ├── api/        Reusable API client (fetch wrapper, carries the auth token) + customers.js, products.js
│   │   ├── auth/       AuthContext (session state, login/logout, hydration on refresh)
│   │   ├── components/ Shared UI (layout, nav, placeholders, ProtectedRoute, ConfirmDialog)
│   │   ├── pages/      Login, Dashboard, pages/customers/, pages/products/ (list, add, edit, details)
│   │   ├── App.jsx     Route definitions
│   │   └── main.jsx    Entry point
│   └── .env.example
├── PROJECT_SPEC.md
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (required from Stage 1 Step 2 onward; the API server itself will still start without it, but migrations and DB-backed routes need a running database)

## Quick Start

Two terminals — one per app, since `npm run dev` keeps running in each:

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env
npm install
npm run migrate:up   # requires a running PostgreSQL — see Database Setup below
npm run dev           # http://localhost:5000

# Terminal 2 — frontend
cd frontend
cp .env.example .env
npm install
npm run dev           # http://localhost:5173
```

Open `http://localhost:5173` — the Dashboard page shows a live "Backend status" check. Or verify from the command line:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/db
```

To build the frontend for production: `cd frontend && npm run build` (output in `frontend/dist/`).

## Getting Started

### Backend

See [Quick Start](#quick-start) for the minimal commands. Details below.

### Database Setup (PostgreSQL)

1. Create a local database (name/user/password should match what you put in `backend/.env`):

   ```sql
   CREATE DATABASE order_booking;
   ```

2. Make sure `backend/.env` has either `DATABASE_URL` set, or the individual `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` values set, pointing at that database.

3. Test the connection:

   ```bash
   cd backend
   npm run db:test
   ```

   This runs a simple `SELECT NOW()` query and reports success or failure — it does not change any data.

4. Run migrations:

   ```bash
   npm run migrate:up
   ```

   This applies all pending migrations from `backend/migrations/` (tracked in the `pgmigrations` table). To roll back the most recent migration: `npm run migrate:down`. To scaffold a new migration file: `npm run migrate:create -- <name>`.

Migrations applied so far:
- `pgcrypto` extension (used for UUID generation).
- `users` table (id, name, username, password_hash, phone, is_active, created_at, updated_at — `PROJECT_SPEC.md` §2), unique username, `updated_at` auto-update trigger. See [Authentication](#authentication) for the login API built on top of it.
- `customers` table (id, name, code, contact_person, phone, alternate_phone, address, city_area, customer_type, is_active, created_at, updated_at — `PROJECT_SPEC.md` §4), unique code, indexes on `name` and `is_active`, `updated_at` auto-update trigger.
- `products` table (id, name, code, company, packing, unit, mrp, sale_price, discount, scheme_enabled, scheme_purchase_qty, scheme_bonus_qty, is_active, created_at, updated_at — `PROJECT_SPEC.md` §5/§7/§8), unique code, `mrp`/`sale_price` non-negative, `discount` a 0–100 percentage, and a table-level check that a product with `scheme_enabled = true` must have `scheme_purchase_qty > 0` and `scheme_bonus_qty >= 0` (both explicitly non-null — a scheme can't be "enabled" with missing quantities). Indexes on `name`, `company`, and `is_active`.
- `orders` table (id, order_number, customer_id, booker_id, status, remarks, subtotal, discount_total, total, submitted_at, cancelled_at, cancelled_by, created_at, updated_at — `PROJECT_SPEC.md` §10–§17). `customer_id`/`booker_id` are `NOT NULL` foreign keys (`ON DELETE RESTRICT` — a customer or booker can't be hard-deleted while referenced); indexes on both plus `status`. `order_number` is `ORD-YYYYMMDD-XXX`-formatted and unique when present. A single check constraint enforces the whole status state machine: `draft` ⇒ no `order_number` and no submitted/cancelled timestamps; `submitted` ⇒ has an `order_number` and `submitted_at`, nothing cancelled; `cancelled` ⇒ has all of `order_number`, `submitted_at`, `cancelled_at`, and `cancelled_by`. Another check keeps `total = subtotal - discount_total`.
- `order_items` table (id, order_id, product_id, product_name, product_code, mrp, rate, discount, paid_qty, bonus_qty, scheme_purchase_qty, scheme_bonus_qty, line_subtotal, line_discount, line_total, created_at, updated_at — `PROJECT_SPEC.md` §16). `order_id` cascades on delete (so deleting a draft cleans up its items); `product_id` is `ON DELETE RESTRICT`. Every commercial column here is a **snapshot taken at order time** — changing the product's price, discount, or scheme afterward never touches existing order items (verified directly: changed a product's price/discount/scheme after creating an order item referencing it, and the item was unaffected). `line_total = line_subtotal - line_discount` is enforced by a check constraint, as is the scheme snapshot being both-or-neither (`scheme_purchase_qty`/`scheme_bonus_qty`). Schema only — no Order API/UI yet.
- `order_number_counters` table (`counter_date` primary key, `last_sequence`) — one row per calendar day, backing the order numbering system below.

Other business tables (reports/targets are computed from orders, not separate tables) are added in later stages.

You can also check DB connectivity through the running API: `curl http://localhost:5000/api/health/db`.

## Order Numbering

`ORD-YYYYMMDD-XXX` (e.g. `ORD-20260905-001`), per `PROJECT_SPEC.md` §11. There is no API/route for this yet — it's implemented at the model layer, ready for the Order API to call in a later step.

- **`backend/src/utils/orderNumber.js`** — `reserveNextOrderNumber(client)` does the actual generation: one atomic `INSERT ... ON CONFLICT (counter_date) DO UPDATE SET last_sequence = last_sequence + 1` against `order_number_counters`, using the database's own `CURRENT_DATE` (no app-side timezone math). A fresh date has no row, so it starts at 1 — that's the entire "daily reset." A generated number over 999 (the format's 3-digit limit) throws instead of producing a malformed number.
- **Concurrency safety**: the UPSERT takes a row lock on that day's counter row for the life of the caller's transaction. A second concurrent caller for the same day simply waits for the first to commit or roll back, then proceeds from the true, correct value — no duplicates, no races.
- **Failed/rolled-back submissions can't corrupt the sequence**: `reserveNextOrderNumber` must be called on a client that's inside the same transaction as the rest of the submission (`backend/src/models/order.js`'s `submitOrder()` does this via `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`). If that transaction rolls back for any reason, the counter increment rolls back with it, and the very next caller gets that exact number back — verified directly (reserve a number, roll back, reserve again, get the identical number).
- **`submitOrder(orderId)`** — the only way an order ever gets a number. Locks the order row (`FOR UPDATE`), requires it to currently be `draft`, reserves the number, and sets `status = 'submitted'` + `submitted_at` — all in one transaction. Draft orders never touch the counter at all.
- **`cancelOrder(orderId, cancelledByUserId)`** — requires the order to currently be `submitted`; sets `status = 'cancelled'` + `cancelled_at`/`cancelled_by` and never touches `order_number`, so a cancelled order keeps its number and that number is never reissued.
- **Uniqueness** is enforced at the database level regardless of the generator (the `orders.order_number` `UNIQUE` constraint from the schema above) — confirmed by trying to insert a duplicate directly via SQL and getting a `23505`.
- Verified with 38 automated checks against a real PostgreSQL instance: exact format, sequential same-day numbers, a different day's counter left untouched (daily reset), sequence-exhaustion detection, rollback-then-reclaim with zero gap, drafts consuming no numbers, duplicate/non-existent/wrong-status submit and cancel attempts all rejected, cancelled orders keeping their number forever, same-day/same-customer orders getting distinct numbers, DB-level duplicate rejection, and **15 real concurrent `submitOrder()` calls producing 15 unique, perfectly contiguous numbers with no gaps or collisions**.

### Frontend

See [Quick Start](#quick-start) — `cd frontend && cp .env.example .env && npm install && npm run dev`, then open `http://localhost:5173`.

## Authentication

- `POST /api/auth/login` — body `{ "username": "...", "password": "..." }`. Returns `{ "token": "...", "user": {...} }` on success. A JWT is used as the token (see `backend/src/utils/jwt.js`); there is no session table. Errors: `400` if username/password are missing, `401` for an unknown username or wrong password (same generic message for both, to avoid revealing which one was wrong), `403` if the account exists and the password is correct but the user is inactive.
- `GET /api/auth/me` — requires `Authorization: Bearer <token>`. Returns the current user (password hash never included). The `authenticate` middleware (`backend/src/middleware/authenticate.js`) re-checks the user's active status against the database on every request, so deactivating a user revokes access immediately, without waiting for the token to expire.
- There are no roles or permissions — every authenticated booker has the same access, per `PROJECT_SPEC.md` §2.
- `JWT_SECRET` and `JWT_EXPIRES_IN` (see `.env.example`) configure the token; generate your own secret for anything beyond local development.

### Frontend session handling

- `frontend/src/auth/AuthContext.jsx` holds the current user and the login/logout functions. On load (including a page refresh) it reads a stored token and calls `GET /api/auth/me` to confirm it's still valid before treating the user as signed in.
- The token is stored in `localStorage` (key `orderBookingApp.authToken`) and attached to every API request by `frontend/src/api/client.js`. This is a deliberate simplicity/security trade-off: the backend only issues a bearer token in the JSON response (no httpOnly cookie flow), so `localStorage` is the practical option for a single-page app at this stage. It is vulnerable to token theft via XSS; if that risk matters later, the fix is a backend change (httpOnly cookie session) rather than a frontend-only one.
- `frontend/src/components/ProtectedRoute.jsx` gates every route inside the app layout: while the session is being checked it shows a loading state, and if there's no valid session it redirects to `/login`, remembering the page that was requested so login sends you back to it.
- `frontend/src/pages/Login.jsx` is a plain username/password form with loading and error states; it also bounces back into the app if you're already signed in and navigate to `/login` directly.

## Customers API

All endpoints are under `/api/customers` and require `Authorization: Bearer <token>` (see [Authentication](#authentication)). Fields: `name`, `code` (unique), `contactPerson`, `phone`, `alternatePhone`, `address`, `cityArea`, `customerType`, `isActive` (see `PROJECT_SPEC.md` §4).

- `POST /api/customers` — create. `name` and `code` are required (non-blank); `code` must be unique (`409` if it already exists). Always created active — `isActive` isn't accepted here.
- `GET /api/customers` — list, paginated (`page`, `limit`, default 20 / max 100), sorted by name. Query params: `search` (matches `name` or `code`, case-insensitive, partial), `isActive` (`true`/`false` — omit to include both). Response: `{ customers: [...], pagination: { page, limit, total, totalPages } }`.
- `GET /api/customers/:id` — details. `404` if not found, `400` if `:id` isn't a valid UUID.
- `PUT /api/customers/:id` — partial update; only send the fields you want to change. Can also update `isActive` here (e.g. to reactivate a deactivated customer). Changing `code` is re-checked for uniqueness (`409` on conflict).
- `DELETE /api/customers/:id` — soft delete: sets `isActive` to `false` rather than removing the row, since future stages (orders) will reference customers and history must not be lost. Reactivate via `PUT` with `{ "isActive": true }`.

### Customer UI

Under `frontend/src/pages/customers/`, all behind the existing login/`ProtectedRoute` and using the existing sidebar layout:

- `CustomerList.jsx` (`/customers`) — table of customers with a debounced name/code search box, an active/inactive status filter, and Previous/Next pagination. Handles loading, error (with Retry), and empty states (the empty message differs depending on whether a search/filter is active). Deactivate/Reactivate can be done directly from a row, with the same confirmation dialog as the details page.
- `AddCustomer.jsx` (`/customers/new`) and `EditCustomer.jsx` (`/customers/:id/edit`) — both share `CustomerForm.jsx`. Client-side checks name/code are non-blank before submitting; server-side errors (e.g. duplicate code → 409) are shown inline without losing the entered data.
- `CustomerDetails.jsx` (`/customers/:id`) — read-only view of all fields, with Edit and Deactivate/Reactivate actions. Shows a "not found" state for a missing/invalid id.
- `components/ConfirmDialog.jsx` — a small reusable modal used before deactivating or reactivating a customer, per `PROJECT_SPEC.md` §25 ("use confirmation dialogs for destructive actions").
- No order history / total-orders / total-sales section is shown on the details page yet — that depends on the Orders module, which doesn't exist until a later stage.

## Products API

All endpoints are under `/api/products` and require `Authorization: Bearer <token>`. Fields: `name`, `code` (unique), `company`, `packing`, `unit`, `mrp`, `salePrice`, `discount` (0–100, defaults to 0), `schemeEnabled`, `schemePurchaseQty`, `schemeBonusQty`, `isActive` (see `PROJECT_SPEC.md` §5/§7/§8).

- `POST /api/products` — create. `name`, `code`, `mrp`, and `salePrice` are required; `mrp`/`salePrice` must be non-negative numbers; `code` must be unique (`409` on conflict). Always created active.
- `GET /api/products` — list, paginated (`page`, `limit`, default 20 / max 100), sorted by name. `search` matches `name`, `code`, or `company` (case-insensitive, partial); `isActive` (`true`/`false`) filters status.
- `GET /api/products/:id` — details. `404` if not found, `400` if `:id` isn't a valid UUID.
- `PUT /api/products/:id` — partial update; only send the fields you want to change, including `isActive` to reactivate. Changing `code` is re-checked for uniqueness.
- `DELETE /api/products/:id` — soft delete (`isActive` → `false`), consistent with Customers; reactivate via `PUT` with `{ "isActive": true }`.

**Bonus scheme validation**: `schemeEnabled`, `schemePurchaseQty`, and `schemeBonusQty` are treated as one unit — you can never end up with a half-set scheme. If a request enables the scheme (either explicitly, or it's already enabled and untouched), the *effective* purchase/bonus quantities (this request's values, falling back to the product's current ones on a partial update) must both be present, with `schemePurchaseQty > 0` and `schemeBonusQty >= 0` — otherwise `400`. Disabling the scheme always nulls out both quantities. A partial update that touches none of these three fields leaves the existing scheme completely alone (it's not silently rewritten).

### Product UI

Under `frontend/src/pages/products/`, behind the same login/`ProtectedRoute` and sidebar layout as everything else:

- `ProductList.jsx` (`/products`) — table with name/code/company search, active/inactive filter, and Previous/Next pagination; columns include MRP, Sale Price, Discount, and the bonus scheme rendered as `"20 + 2"` (or "No scheme"). Same loading/error(+Retry)/empty states and inline Deactivate/Reactivate-with-confirmation as the Customer list, including the same out-of-range-page snap-back.
- `AddProduct.jsx` / `EditProduct.jsx` — share `ProductForm.jsx`, with a Pricing section (MRP, Sale Price, Discount) and a Bonus Scheme section: an "Enable bonus scheme" checkbox that reveals Purchase/Bonus Quantity fields and a live preview line showing the scheme the way the spec documents it, e.g. "shown as `20 + 2`". Required fields use native HTML validation first; a JS validator (mirroring the backend's rules) catches anything that slips through, and server errors (e.g. duplicate code) surface inline without losing entered data.
- `ProductDetails.jsx` (`/products/:id`) — read-only Basic Info / Pricing / Bonus Scheme sections, Edit and Deactivate/Reactivate actions, and a "not found" state for a missing/invalid id.
- `schemeFormat.js` — the single place that turns `{schemeEnabled, schemePurchaseQty, schemeBonusQty}` into the "20 + 2" / "No scheme" text, shared by the list and details views.

## API Structure

- All routes are mounted under `/api` via `backend/src/routes/index.js`. Add new domain routers there in later stages (orders, ...).
- Route handlers that need to report an error should `throw new ApiError(statusCode, message)` (see `backend/src/utils/ApiError.js`), wrapping async handlers with `asyncHandler` (see `backend/src/utils/asyncHandler.js`) so the error reaches the centralized handler in `backend/src/middleware/errorHandler.js`.
- Error responses have a consistent shape: `{ "error": { "status": <code>, "message": "..." } }`. Unknown routes return a 404 in the same shape via `backend/src/middleware/notFoundHandler.js`.
- The frontend calls the API through `frontend/src/api/client.js`, a small `fetch` wrapper that reads `VITE_API_BASE_URL`, throws on non-2xx responses (using the error message above when present), and exposes `get`/`post`/`put`/`delete` helpers.

## Environment Variables

Each app has its own `.env.example`:

- `backend/.env.example` — server port, CORS origin, PostgreSQL connection settings, and `JWT_SECRET`/`JWT_EXPIRES_IN` for authentication.
- `frontend/.env.example` — API base URL used by the frontend.

Copy each to `.env` in the same folder and adjust as needed. Never commit `.env` files.

## Known Issues

- `npm audit` reports a few moderate/high advisories in transitive dependencies (`qs`/`body-parser` behind `express` in the backend; `esbuild`/`react-router` behind `vite`/`react-router-dom` in the frontend). No non-breaking fix is currently available (`npm audit fix` makes no changes); the only fixes require a major upgrade (Express 5, Vite 6+, React Router 7). Not addressed in this stage to avoid an unrequested breaking change — revisit in a maintenance pass.
- No PostgreSQL server is bundled; you need one running locally (or reachable) for `npm run migrate:up`, `npm run db:test`, and `/api/health/db` to succeed. The rest of the app works without it.

## Development Approach

This project is built incrementally, one stage at a time, per `PROJECT_SPEC.md` §40. Do not add business logic ahead of the current stage.
