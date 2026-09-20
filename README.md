# Medicine Order Booking App

A standalone, open-source order-booking and basic sales-management application for a medicine distribution business.

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the full product and technical specification. That document is the source of truth for all features and business rules.

## Status

**Stage 1 — Project Foundation: complete.** Project scaffolding, basic routing, the PostgreSQL/migrations foundation, a clean REST API structure with centralized error handling, and a reusable frontend API client are all in place and verified.

**Stage 2 — Authentication & Booker System: complete.** The `users` table exists, the login API (`POST /api/auth/login`, `GET /api/auth/me`) works, and the frontend has a login page that gates every app route: unauthenticated visitors are redirected to `/login`, a session survives a page refresh, invalid/expired/deactivated sessions are rejected, and logout is wired up. There is still no user-management UI/API and no roles/permissions (none are planned — see `PROJECT_SPEC.md` §2).

**Stage 3 — Customers: complete.** The `customers` table exists (see `PROJECT_SPEC.md` §4), a full REST API is available at `/api/customers` (create, list/search/filter/paginate, get, update, deactivate — all behind authentication), and there's a full UI for it: a searchable/filterable/paginated list, add/edit forms, a details view, and deactivate/reactivate with a confirmation dialog. Verified end-to-end from a clean database, including a fix for a pagination edge case (deactivating/reactivating the last row on a page no longer strands the list on an empty "no results" page — it now snaps back to a valid page). Stage 1/2 features (health checks, migrations, login/auth) were re-confirmed unaffected. Order history, total-orders and total-sales still don't appear anywhere — they depend on the Orders module, not built yet.

**Stage 4 — Products & Pricing: complete.** The `products` table exists (see `PROJECT_SPEC.md` §5, §7, §8), a full REST API is available at `/api/products`, and there's a full UI for it: a searchable/filterable/paginated list (with MRP, Sale Price, Discount, and scheme shown per row), add/edit forms with a Pricing section and a Bonus Scheme toggle that shows a live "20 + 2"-style example, a details view, and deactivate/reactivate with a confirmation dialog. Re-verified end-to-end from a clean database, including a fix for a validation gap (explicit `null` for `mrp`/`salePrice`/`discount` was silently coerced to `0` instead of being rejected — a quirk of `Number(null) === 0` in JavaScript). Authentication, Customer, and prior-stage functionality were all re-confirmed unaffected by full regression runs. There is no separate bulk "Prices" page — pricing is managed as part of each product's form, since the step's requirements scoped "Prices" to fields on the product itself. The `/prices` route and its sidebar link were removed entirely once the rest of the application was finished, rather than left as a placeholder for a screen that isn't planned.

**Stage 5 — Order Booking Engine: complete.** The `orders` and `order_items` tables exist (see `PROJECT_SPEC.md` §10–§17, §26, §34): an order belongs to a customer and a booker, has a `draft`/`submitted`/`cancelled` status enforced by a DB-level state machine (each status requires an exact, consistent combination of `order_number`/`submitted_at`/`cancelled_at`/`cancelled_by`), and every order item is a full historical snapshot (product name/code, MRP, rate, discount, paid/bonus quantities, the scheme that applied, and the computed line amounts) that a later product/price/discount/scheme change can never alter. The `ORD-YYYYMMDD-XXX` order numbering system (§11) is implemented and tested — see [Order Numbering](#order-numbering). On top of that, the Order API is now live at `/api/orders`: create an order or save it as a draft, list/search/filter orders, and fetch full order details, with prices, discounts, bonus quantities and totals all calculated server-side and written in a single atomic transaction — see [Orders API](#orders-api). Verified end-to-end against a real PostgreSQL database with 206 automated checks (including 12 concurrent submissions producing unique, contiguous order numbers), plus a regression pass over Stage 1–4 functionality. The Create Order screen is live at `/orders/new` — a searchable customer picker, a fast product search that adds lines with one click or the Enter key, live line totals/discounts/bonus quantities, an Order Summary with remarks, and Save as Draft / Submit Order (see [Create Order UI](#create-order-ui)). The screen's live preview was checked against the backend's own calculation over 20,983 combinations of price, discount, scheme and quantity — they agree exactly, so what the booker reviews is what gets stored. Viewing, editing, cancelling and deleting existing orders (`PROJECT_SPEC.md` §13–§15, §17) still have no UI, and `submitOrder`/`cancelOrder` remain model-layer only — those belong to Stages 6/7.

**Stage 6 — Draft Orders: complete.** Drafts are now a full workflow, not just a status. `/orders/drafts` lists every saved draft with its customer, booker, item count, total and remarks, and each row offers View, Continue, Submit and Delete (`PROJECT_SPEC.md` §13). Continuing a draft reopens it in the Create Order screen with its customer, items and remarks loaded back in and **every line re-priced at today's values**, with a banner naming anything that changed since it was saved; submitting a draft assigns the final `ORD-YYYYMMDD-XXX` number and makes the order permanent. Backed by three new endpoints — `PUT /api/orders/:id`, `POST /api/orders/:id/submit`, `DELETE /api/orders/:id` — plus an `ids` filter on the products list so a draft's lines reload in one request. Verified with 115 automated checks against a real database (including 6 concurrent submissions of the same draft producing exactly one order number) and a 32-check walk of the UI's own request sequence against the running dev server; Stage 5's 206 checks and the 20,983-case calculation parity check were re-run and still pass. Cancelling a submitted order and the full Orders module (§15, §17) are still Stage 7.

**Stage 7 — Orders & Cancellation: complete.** The Orders module is live at `/orders`: submitted and cancelled orders in one searchable, paginated list with Date-range, Customer, Booker and Status filters (all combinable) plus a Today's Orders shortcut, and a single Order Details view at `/orders/:id` that serves drafts, submitted and cancelled orders alike — showing only the actions each status actually permits. Cancellation (`POST /api/orders/:id/cancel`, `PROJECT_SPEC.md` §15) marks a submitted order cancelled with `cancelled_at` and `cancelled_by` while keeping the order intact — every line, its totals and its order number stay exactly as they were, and that number is never reissued. **Strict locking is enforced at the API, not just hidden in the UI**: there is no route anywhere that edits a submitted order, and `PUT`/`DELETE`/`submit` all return `409` for one. Draft, Submitted and Cancelled each get a distinct badge from one shared component, and cancelled rows are struck through so they can't be mistaken for orders that count. Verified with 81 automated checks (including 5 concurrent cancellations of one order resolving to exactly one recorded cancellation) plus a 41-check walk of the UI's request sequence; all of Stages 5-6 (353 checks and the 20,983-case parity check) re-run and still pass. Sales Reports, the Dashboard and Targets — which are where excluding cancelled orders actually starts to matter — are Stages 8-10.

**Stage 8 — Sales Reports: complete.** `/reports` presents all six reports §18 requires as tabs — Daily, Monthly, Customer-wise, Product-wise, Booker-wise and Date Range — over a shared date-range filter with Today / This Month / This Year / All Time presets, and a totals strip (valid orders, gross, discount, net sales, paid qty, bonus qty) that always covers the whole period rather than the visible page. All of it is computed by `backend/src/models/report.js`, which is the **single definition of a valid sale** §34 demands: only `submitted` orders count, drafts and cancelled orders are excluded, bonus quantities carry zero value, and line discounts are already deducted. No sales arithmetic exists anywhere on the client. Verified with 128 automated checks aimed squarely at those rules — including cancelling an order and watching its value leave the totals, a scheme granting 100 free units adding nothing to sales, and every report summing to the identical figure — plus a 37-check walk of the page's request sequence against live data. Stages 5-7 (430 checks) and the 20,983-case parity check were re-run and still pass. Targets (§19) and the Dashboard (§3) are Stages 9-10; both will read their figures from this same module.

**Stage 9 — Targets: complete, with company-wise targets.** `/targets` sets and reviews monthly targets (§19) at two scopes: the month **overall**, and per **manufacturer** — an approved extension to the original overall-only target, written into `PROJECT_SPEC.md` §19 per the change-management rule in §42. Progress cards and a table show Target, Achieved, Remaining, Achievement % and Status for each scope, and manufacturers that sold this month without a target are listed too, so a missing target is visible rather than invisible. Achieved never leaves `backend/src/models/report.js` — the same valid-sales definition Sales Reports use (§34) — so a target and a sales report can't disagree about the same month; a test asserts the two match to the paisa. Zero targets are handled as §19 demands: the percentage is `null`, never `NaN` or `Infinity`. New `monthly_targets` table plus `GET/POST/PUT /api/targets`, `PUT/DELETE /api/targets/:id` and `GET /api/products/companies`. Verified with 131 automated checks and a 41-check walk of the page's request sequence; Stages 5-8 (561 checks, 110 UI-flow checks) and the 20,983-case parity check re-run and still pass. The Dashboard (§3) is Stage 10 and will read the same module.

**Stage 10 — Dashboard, UI Polish & QA: complete.** The Dashboard is live at `/` with the operational overview §3 asks for: today's orders and sales, this month's orders and sales, the monthly target with achieved / remaining / achievement %, the draft-order count, recent orders, and Quick Actions for Create Order, Customers, Products and Orders. `GET /api/dashboard` computes **nothing of its own** — every figure is assembled from `report.js`, `target.js` and `order.js`, so §34's "do not implement separate formulas for each screen" holds by construction rather than by discipline; tests assert the Dashboard matches Sales Reports and Targets to the paisa, including after a cancellation. The polish pass added a React error boundary, a real 404 page, a responsive shell (the sidebar becomes a scrolling strip below 900px), and a Retry action on the five load-error screens that had none. Verified with 80 new automated checks; the whole suite — **741 backend checks across Stages 5-10, 185 live UI-flow checks, and the 20,983-case calculation parity check** — passes.

## Project Structure

```text
order-booking-app/
├── backend/            Node.js + Express API
│   ├── migrations/     PostgreSQL schema migrations (node-pg-migrate)
│   ├── src/
│   │   ├── config/     Configuration (PostgreSQL pool, connection test)
│   │   ├── middleware/ Centralized error/404 handling, JWT authentication
│   │   ├── models/     Plain SQL data-access functions (user.js, customer.js, product.js, order.js, orderItem.js, report.js, target.js)
│   │   ├── routes/     Express route modules (index.js aggregates them under /api)
│   │   ├── utils/      ApiError, asyncHandler, password hashing, JWT signing, order numbering, order pricing, product import
│   │   ├── app.js      Express app setup
│   │   └── server.js   Entry point
│   ├── .node-pg-migraterc
│   └── .env.example
├── frontend/           React app (Vite)
│   ├── src/
│   │   ├── api/        Reusable API client (fetch wrapper, carries the auth token) + customers.js, products.js, companies.js, orders.js, users.js, reports.js, targets.js
│   │   ├── auth/       AuthContext (session state, login/logout, hydration on refresh)
│   │   ├── components/ Shared UI (layout, nav, ProtectedRoute, ConfirmDialog, ErrorBoundary) + orders/ (receipt)
│   │   ├── pages/      Login, Dashboard, pages/customers/, pages/products/, pages/companies/, pages/orders/, pages/reports/, pages/targets/
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
- `products` table (id, name, code, company, packing, unit, mrp, sale_price, discount, bonus_schemes, is_active, created_at, updated_at — `PROJECT_SPEC.md` §5/§7/§8), unique code, `mrp`/`sale_price` non-negative, `discount` a 0–100 percentage. `bonus_schemes` is a JSONB array of `{purchaseQty, bonusQty}` tiers (`[]` = no scheme; migration `1790100000000_add-product-bonus-schemes` folded the former `scheme_enabled` / `scheme_purchase_qty` / `scheme_bonus_qty` columns into it); its shape is enforced by the API, which caps it at 10 tiers with unique purchase quantities. Indexes on `name`, `company`, and `is_active`.
- `orders` table (id, order_number, customer_id, booker_id, status, remarks, subtotal, discount_total, total, submitted_at, cancelled_at, cancelled_by, created_at, updated_at — `PROJECT_SPEC.md` §10–§17). `customer_id`/`booker_id` are `NOT NULL` foreign keys (`ON DELETE RESTRICT` — a customer or booker can't be hard-deleted while referenced); indexes on both plus `status`. `order_number` is `ORD-YYYYMMDD-XXX`-formatted and unique when present. A single check constraint enforces the whole status state machine: `draft` ⇒ no `order_number` and no submitted/cancelled timestamps; `submitted` ⇒ has an `order_number` and `submitted_at`, nothing cancelled; `cancelled` ⇒ has all of `order_number`, `submitted_at`, `cancelled_at`, and `cancelled_by`. Another check keeps `total = subtotal - discount_total`.
- `order_items` table (id, order_id, product_id, product_name, product_code, mrp, rate, discount, paid_qty, bonus_qty, scheme_purchase_qty, scheme_bonus_qty, line_subtotal, line_discount, line_total, created_at, updated_at — `PROJECT_SPEC.md` §16). `order_id` cascades on delete (so deleting a draft cleans up its items); `product_id` is `ON DELETE RESTRICT`. Every commercial column here is a **snapshot taken at order time** — changing the product's price, discount, or scheme afterward never touches existing order items (verified directly: changed a product's price/discount/scheme after creating an order item referencing it, and the item was unaffected). `line_total = line_subtotal - line_discount` is enforced by a check constraint, as is the scheme snapshot being both-or-neither (`scheme_purchase_qty`/`scheme_bonus_qty`). Written by the Order API — see [Orders API](#orders-api).
- `order_number_counters` table (`counter_date` primary key, `last_sequence`) — one row per calendar day, backing the order numbering system below.

- `users.company_name` (varchar(150), nullable) — the distribution business a booker works for, set at registration and
  used to brand the sidebar and the order receipt. Nullable so accounts created before the column existed stay valid;
  the UI falls back rather than showing an empty header. A check constraint stops a present-but-blank value, which
  would defeat that fallback.

- `monthly_targets` table (id, year, month, company, target_amount, created_at, updated_at — `PROJECT_SPEC.md` §19). `company` NULL is the month's overall target; a value scopes it to that manufacturer. A unique index on `(year, month, lower(coalesce(company, '')))` allows exactly one target per month per scope — `COALESCE` so NULLs don't count as distinct, `lower` so `GSK` and `gsk` can't become two targets for the same sales. Manufacturer is free text matched against `products.company`, not a foreign key: companies aren't an entity in this application.

Sales figures are computed from orders rather than stored, so there is no reports table.

You can also check DB connectivity through the running API: `curl http://localhost:5000/api/health/db`.

## Order Numbering

`ORD-YYYYMMDD-XXX` (e.g. `ORD-20260905-001`), per `PROJECT_SPEC.md` §11. `POST /api/orders` uses this whenever it creates a submitted order (see [Orders API](#orders-api)); `submitOrder()`/`cancelOrder()` are the model-layer transitions for an order that already exists, and don't have routes yet.

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
- `POST /api/auth/register` — creates a booker. Body `{ name, username, password, companyName, phone? }`; `password`
  must be at least 8 characters and `companyName` is **required**, because it is what the application is branded with.
  Returns `{ token, user }` — the new account is signed straight in, so first-run setup isn't a two-step dance. `409`
  if the username is taken, `400` with per-field messages otherwise.

  **Who may register:** anyone, while the system has **no users at all** — that is the first-run account that names the
  business. After that it requires a signed-in booker (`401` otherwise). This application has no roles and no
  permissions by design (`PROJECT_SPEC.md` §2), so every account can read every customer, order and sales figure; an
  endpoint that let anyone create one would hand the whole business's data to whoever found the URL. Gating it this way
  keeps self-service setup without leaving the door open behind it. If you want registration fully open, it is a
  two-line change in `backend/src/routes/auth.routes.js`.

- `PUT /api/auth/company` — renames the business. Body `{ companyName }`; requires a signed-in booker. Returns the
  refreshed user and `accountsUpdated`. An application-level setting (`PROJECT_SPEC.md` §24), not a business record —
  it changes what the app calls itself, and touches no customer, product or order data.

- `GET /api/auth/registration-status` — public; `{ open }` says whether an account can be created without signing in
  (i.e. whether this is a fresh installation). The sign-in page uses it to show its setup link only when that link
  would actually work.

- `GET /api/auth/me` — requires `Authorization: Bearer <token>`. Returns the current user (password hash never included). The `authenticate` middleware (`backend/src/middleware/authenticate.js`) re-checks the user's active status against the database on every request, so deactivating a user revokes access immediately, without waiting for the token to expire.
- There are no roles or permissions — every authenticated booker has the same access, per `PROJECT_SPEC.md` §2.
- `JWT_SECRET` and `JWT_EXPIRES_IN` (see `.env.example`) configure the token; generate your own secret for anything beyond local development.

### Company branding

`users.company_name` is the distribution business a booker works for, captured at registration. It is **not**
`products.company`, which is a medicine's manufacturer (`PROJECT_SPEC.md` §5) — the two are unrelated and deliberately
kept apart.

It travels with the session: returned by `POST /api/auth/login`, `POST /api/auth/register` and `GET /api/auth/me` as
`user.companyName`, so it is available anywhere `useAuth()` is, and carried in the JWT payload as a convenience for
anything inspecting the token. The token is never the source of truth — the `authenticate` middleware re-reads the user
on every request, so a changed company name takes effect immediately rather than at the next login.

Two places use it:

- **Sidebar header** — the business name replaces the generic app title.
- **Order receipt** — the printed heading, in both the on-screen preview and the vector PDF, plus the page footer.

**Fallback**: anywhere the name is missing, empty or only whitespace, both fall back to **"Medicine Distribution"**. The
column is nullable on purpose — accounts created before it existed have nothing to backfill with, and inventing a
company name would put a wrong one on someone's invoice. A `NULL` is a safe, visible state rather than a broken one. On
the receipt, the strapline is dropped when it would just repeat the heading.

### Settings UI

`/settings` (sidebar: **Settings**), from `frontend/src/pages/settings/Settings.jsx`. Deliberately minimal: §24 permits
a Settings section for application-level configuration and warns against inventing settings without a requirement, so
it holds the one thing that genuinely is application-level — the company name — plus a read-only summary of the
signed-in account. No business data lives here.

Saving calls `PUT /api/auth/company` and then `refreshUser()`, so the sidebar and any receipt pick the new name up
immediately without a reload. Save is disabled while the value is unchanged or blank.

**The rename applies to every account on the installation.** There is one business per installation (§1), and two
bookers printing receipts headed with different names for the same firm would be a bug, not a feature. The page says
so, and reports how many accounts were updated. Any booker may do it — there are no roles (§2), and inventing an admin
concept for one field would contradict that.

**Historical receipts are not rewritten**: a receipt is generated from the current name each time it is exported, so
re-exporting an older order shows the new name. The order's own commercial values are untouched (§16).

### Signup UI

`/signup` (`frontend/src/pages/Signup.jsx`), public, sharing the sign-in card. It serves the two cases the API allows
and says which one it is in, rather than showing one form that sometimes fails:

- **First run** — no users exist. "Create your account": company name, full name, username, optional phone, password
  and confirmation. On success the new session is adopted and the booker lands on the dashboard.
- **Adding a colleague** — a signed-in booker opens `/signup`. The heading becomes "Add a booker", and the token the
  API returns for the new account is deliberately **ignored**: switching the current booker into the account they just
  created would be a surprising way to log them out. A confirmation names the new username, the form clears, and they
  stay signed in.
- **Anyone else** — told the installation is already set up, with a link to sign in, because the API would refuse them.

The password is confirmed twice: there is no password reset in this application, so a typo on the first account would
lock the business out entirely. The sign-in page links here only while registration is open.

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

All endpoints are under `/api/products` and require `Authorization: Bearer <token>`. Fields: `name`, `code` (unique), `company`, `packing`, `unit`, `mrp`, `salePrice`, `discount` (0–100, defaults to 0), `bonusSchemes` (an array of `{ purchaseQty, bonusQty }` tiers, `[]` for no scheme), `isActive` (see `PROJECT_SPEC.md` §5/§7/§8). Every product in a response also carries `schemeEnabled` / `schemePurchaseQty` / `schemeBonusQty`, derived from its **first** tier for readers that only show one.

- `POST /api/products` — create. `name`, `code`, `mrp`, and `salePrice` are required; `mrp`/`salePrice` must be non-negative numbers; `code` must be unique (`409` on conflict). Always created active.
- `GET /api/products` — list, paginated (`page`, `limit`, default 20 / max 100), sorted by name. `search` matches `name`, `code`, or `company` (case-insensitive, partial); `isActive` (`true`/`false`) filters status. `ids` (comma-separated, 1–200) fetches exactly those products and returns the whole set rather than a page — it exists so reopening a saved draft can re-price every line in one request instead of one request per line. Inactive products are still returned by `ids`, flagged `isActive: false`, so the caller can tell the difference between "deactivated" and "gone".
- `GET /api/products/:id` — details. `404` if not found, `400` if `:id` isn't a valid UUID.
- `PUT /api/products/:id` — partial update; only send the fields you want to change, including `isActive` to reactivate. Changing `code` is re-checked for uniqueness.
- `DELETE /api/products/:id` — soft delete (`isActive` → `false`), consistent with Customers; reactivate via `PUT` with `{ "isActive": true }`.

- `POST /api/products/validate-bulk` — works out exactly what importing a `.xlsx`, `.xls` or `.csv` file **would do**,
  without doing any of it. This is the first half of a two-step import: test the file, fix what's reported, then
  import. `multipart/form-data` with the spreadsheet in a `file` field.

  Returns `{ isValid, summary, errors, updates, unmappedHeaders, message }` where
  `summary` is `{ totalRows, validRows, invalidRows, newProducts, updatedProducts, generatedCodes }`. Each error is
  `{ row, field, message }` — the **spreadsheet row number**, the **column heading**, and what's wrong with that cell.
  `updates` lists which existing products would change and how each was matched, so an update is never a surprise.

- `POST /api/products/bulk-upload` — applies the file. Same body. It runs **exactly the same checks**
  `validate-bulk` ran, through the same code path, because the client is never trusted to have called it.
  All-or-nothing: if anything is wrong nothing is written and it answers `422` with the identical `errors` array;
  otherwise every insert and update happens in a single transaction and it answers `201` with
  `{ imported, updated, summary, products }`.

- `GET /api/products/sample-template` — downloads `product-import-template.xlsx`: a **Products** sheet with required
  columns first and marked `*`, two worked examples (the second deliberately leaves the code, MRP and scheme blank to
  show the defaults working), plus an **Instructions** sheet explaining the matching rules and every default. The
  template imports cleanly as-is.

### The import is an upsert

A row that matches a product already in the catalogue **updates** it; anything else is **inserted**. That makes
re-importing a supplier's revised price list the normal case, rather than a source of duplicates.

**Matching:**

- A row that gives a **Product Code** matches the product with exactly that code (case-sensitive, as everywhere else
  in the app). If nothing has that code the row is a **new** product using it — it does *not* then fall back to
  matching by name, because an explicitly supplied new code says "this is a new product".
- A row that leaves Product Code blank matches by **Product Name**, compared case-insensitively.
- Anything unmatched is inserted, with a code generated at save time.

**Guards**, all reported at validation rather than discovered on write:

- Product names aren't unique in the table, so a name matching **several** products is refused rather than guessed at —
  the error names every candidate's code and asks for a Product Code to disambiguate.
- Two rows resolving to the **same existing product** are refused, as are two new rows claiming the same code, or the
  same name with no codes.
- An update **never changes a product's code** — that is the identity the `UNIQUE` constraint rests on — and never
  touches `is_active`, so a deliberately deactivated product isn't silently brought back by a price list. Inactive
  products are still matched, otherwise an import would try to insert a duplicate code and fail.

### Import column rules

Deliberately looser than the Add Product form, because a supplier's price list is not a carefully filled-in form:

| Column | | New product | Existing product |
| --- | --- | --- | --- |
| Product Name | **required** | Non-blank, ≤200 characters | Updated |
| Sale Price | **required** | A number greater than 0 | Updated |
| Product Code | optional | Generated (`PROD-0001`…) if blank | Matches the product; never changed |
| MRP | optional | Defaults to `0` | **Blank = left alone** |
| Discount | optional | Defaults to `0` (0–100) | **Blank = left alone** |
| Scheme Purchase Qty | optional | Blank = no scheme; above 0 creates one | **Blank = left alone**; `0` removes the scheme. A sheet describes ONE tier per product and it replaces every tier the product had — products with several tiers are best left blank here and edited in the app. |
| Scheme Bonus Qty | optional | Defaults to `0` | Only read when a Purchase Qty is given |
| Company, Packing, Unit | optional | Empty if blank | **Blank = left alone** |

**A blank cell means "leave this alone" on an update, not "set it to zero".** This is the single most important rule in
the feature: a price list that only carries names, prices and manufacturers would otherwise wipe the MRP and bonus
scheme off every product it touched. Defaults apply to new products only. The scheme's three fields are always changed
together, so a Bonus Qty with no Purchase Qty is reported rather than half-applied.

Headers are matched ignoring case, spaces, punctuation and the `*` marker, and common aliases are accepted
(`price`/`rate` for Sale Price, `manufacturer` for Company, `purchase qty` for Scheme Purchase Qty, …). Numbers
tolerate thousands separators and a leading currency symbol. Unrecognised columns are ignored but returned in
`unmappedHeaders`, so a mistyped header is visible rather than silent. A sheet still carrying the old `Scheme Enabled`
column is accepted, but a `Yes` with no purchase quantity is reported rather than silently dropped. Blank padding rows
are skipped. New products are created Active.

**Two validation gates.** The import's own rules produce the friendly per-field messages above; what each row would
*become* is then checked against the **shared product validator** that `POST /api/products` uses — an insert as the
whole payload, an update as the product it will be once the patch is applied. The import may be more permissive about
what a *user* must supply, but it can never write a product the product API itself would reject.

**Generated product codes.** Rows that leave Product Code blank and match nothing get one assigned inside the write
transaction, not before it. Generation takes a transaction-level advisory lock (`pg_advisory_xact_lock`) and continues
from the highest `PROD-#####` already in the table, so two imports uploaded at the same moment queue up instead of both
reading the same highest code; codes typed explicitly into the same file are skipped. The `UNIQUE` constraint on `code`
remains the real guarantee — any clash rolls the whole batch back.

**Bonus scheme validation**: `bonusSchemes` is validated as a whole: at most 10 tiers, each with a whole `purchaseQty > 0` and a whole `bonusQty >= 0`, and no two tiers sharing a `purchaseQty` (the server could not tell which applies) — otherwise `400`. Tiers are stored sorted by `purchaseQty`. The older single-scheme trio (`schemeEnabled`, `schemePurchaseQty`, `schemeBonusQty`) is still accepted on input as shorthand for a zero- or one-tier list, so an older client keeps working; when both forms are sent, `bonusSchemes` wins. A partial update that mentions none of these leaves the product's tiers completely alone (they're not silently rewritten).

### Product UI

Under `frontend/src/pages/products/`, behind the same login/`ProtectedRoute` and sidebar layout as everything else:

- `ProductList.jsx` (`/products`) — table with name/code/company search, active/inactive filter, and Previous/Next pagination; columns include MRP, Sale Price, Discount, and the bonus scheme rendered as `"20 + 2"` (or "No scheme"). Same loading/error(+Retry)/empty states and inline Deactivate/Reactivate-with-confirmation as the Customer list, including the same out-of-range-page snap-back.
- `AddProduct.jsx` / `EditProduct.jsx` — share `ProductForm.jsx`, with a Pricing section (MRP, Sale Price, Discount) and a Bonus Scheme section: an "Enable bonus scheme" checkbox that reveals Purchase/Bonus Quantity fields and a live preview line showing the scheme the way the spec documents it, e.g. "shown as `20 + 2`". Required fields use native HTML validation first; a JS validator (mirroring the backend's rules) catches anything that slips through, and server errors (e.g. duplicate code) surface inline without losing entered data.
- `ProductDetails.jsx` (`/products/:id`) — read-only Basic Info / Pricing / Bonus Scheme sections, Edit and Deactivate/Reactivate actions, and a "not found" state for a missing/invalid id.
- `ImportProductsModal.jsx` — bulk import, opened from **Import Products** beside Add Product on the list. It leads
  with which columns are **Required** (Product Name, Sale Price) versus **Optional**, each optional one annotated with
  what blank does for a new product versus an existing one, then a Download Sample Template button and a
  drag-and-drop / click-to-choose upload area that checks extension and size before sending.

  The two actions are ordered and gated: **1. Test / Validate File** is the only one available at first, and
  **2. Upload / Import Products** stays disabled until a validation pass comes back completely clean. Choosing a
  different file clears the previous result, so an enabled Import button can only ever refer to the file that was
  actually checked.

  A clean pass shows a green ✓ and a **breakdown** — rows processed, new products to add, existing products to update —
  plus an expandable list of exactly which existing products would change and whether each was matched by code or by
  name. That list is the safety net for the risk inherent in name matching: a typo silently rewriting the wrong
  product. A failed pass shows the same breakdown alongside a table of **Row / Column / Problem**. The product list
  behind the modal refreshes the moment anything lands.

- `schemeFormat.js` — the single place that turns a product's `bonusSchemes` into the "20 + 2" / "10 + 1, 50 + 6" / "No scheme" text (`formatScheme`), and one tier into "20 + 2" (`formatTier`), shared by the list, details and order views.

## Users API

- `GET /api/users` — read-only list of bookers (`id`, `name`, `username`, `phone`, `isActive`; never a password hash),
  sorted by name. It exists so the Orders module's Booker filter (`PROJECT_SPEC.md` §17) can show names instead of ids.
  Inactive bookers are included, because they still own historical orders that have to stay findable.

This is deliberately the whole of it: there is no user management in the application and none is planned — no roles, no
permissions, every authenticated booker has the same access (`PROJECT_SPEC.md` §2).

## Companies API

- `GET /api/companies` — every manufacturer that has at least one **active** product, with how many it has:
  `{ companies: [{ company, productCount }], total, totalProducts }`, sorted by name.

- `GET /api/products?company=<name>` — one manufacturer's products. An **exact** name match (case-insensitive), not
  the partial `ILIKE` that `search` uses, so browsing `GSK` can never pull in `GSK Consumer`. Combines with `search`,
  `isActive` and pagination, so the company view can search within a company.

**There is no companies table, and there should not be one.** Company is a field on the product
(`PROJECT_SPEC.md` §5), and §21/§27 warn against inventing entities. Both endpoints derive the list from the products
themselves, so it stays correct on its own as products are added, edited, imported or deactivated — there is nothing
to keep in step, and no way for a company record to outlive its products.

Counts are of active products only, so a manufacturer whose products have all been deactivated drops off the list: it
has nothing left to sell. The endpoint is deliberately not paginated and does no server-side search — the list is
bounded by how many manufacturers a distributor deals with, which is dozens, and §35 asks for server-side search on
*large* datasets.

### Companies UI

`/companies` (sidebar: **Companies**), from `frontend/src/pages/companies/`.

- `CompanyList.jsx` (`/companies`) — a grid of company cards showing the manufacturer and its active product count,
  with a search box that filters the already-loaded list in the browser rather than firing a request per keystroke.
  The header line totals the companies and their products. Loading, error-with-Retry and empty states throughout; the
  empty state explains that a company appears as soon as an active product is assigned to one, and links to the
  product import.
- `CompanyProducts.jsx` (`/companies/:companyName`) — that manufacturer's catalogue: Product Name, Code, MRP, Sale
  Price, Discount and Bonus Scheme, with a debounced search *within* the company, pagination, and a **Back to
  Companies** button. Product names link through to the product's own page.

Shows active products only, so the table total always agrees with the count on the company's card — a product missing
from here has been deactivated, and the empty state says so and points at the Products page, which shows inactive ones
too. The company name is percent-encoded into the URL, since manufacturer names contain spaces and punctuation.

## Orders API

All endpoints are under `/api/orders` and require `Authorization: Bearer <token>`. Implemented in
`backend/src/routes/orders.routes.js`, with the transaction in `backend/src/models/order.js`
(`createOrderWithItems`) and the money/bonus rules in `backend/src/utils/orderPricing.js`.

- `POST /api/orders` — create an order. Body:

  ```json
  {
    "customerId": "<uuid>",
    "status": "submitted",
    "remarks": "Deliver before noon",
    "items": [{ "productId": "<uuid>", "quantity": 25 }]
  }
  ```

  `status` is optional and defaults to `"submitted"`; pass `"draft"` to save the order for later. A draft may have no
  items (it's an order still being built) and never consumes an order number; a submitted order requires at least one
  item and gets its `ORD-YYYYMMDD-XXX` number stamped in the same transaction (`PROJECT_SPEC.md` §11, §13, §26).
  Returns `201` with the same body shape as `GET /api/orders/:id`.

- `GET /api/orders` — list, newest first, paginated (`page`, `limit`, default 20 / max 100). Filters, all combinable:
  `search` (order number, customer name, or customer code — case-insensitive, partial), `status`, `customerId`,
  `bookerId`, `dateFrom`, `dateTo` (inclusive `YYYY-MM-DD` calendar dates matched on the order's creation date).
  `status` takes one value or a comma-separated list (`submitted,cancelled`), so the Orders module can show submitted
  and cancelled orders together while Draft Orders asks for drafts alone. Response:
  `{ orders: [...], pagination: { page, limit, total, totalPages } }`. Each row carries the joined `customer` and
  `booker`, an `itemCount`, and `cancelledByName` on a cancelled order, so the list needs no follow-up requests. Every
  booker sees every order — there are no roles (`PROJECT_SPEC.md` §2); `bookerId` is a filter, not a permission.

- `GET /api/orders/:id` — full details: the order, its `customer` and `booker`, and every line item with its
  historical snapshot (`PROJECT_SPEC.md` §17). `404` if not found, `400` if `:id` isn't a valid UUID. Items come back
  sorted by product name — all the lines of an order are inserted in one transaction and share a `created_at`, so that
  column can't order them on its own, and a stable order keeps every view of an order consistent.

- `PUT /api/orders/:id` — replace a **draft's** contents: customer, remarks and all lines. Same body as `POST`
  minus `status` (an edit never changes an order's status — submitting is its own endpoint, so an edit can't quietly
  finalize an order). Returns `409` for anything that isn't currently a draft, since submitted orders are not editable
  (`PROJECT_SPEC.md` §14). The lines are **re-priced from the products' current values**, not carried over from the
  saved snapshot — the same rule the order followed when it was first built (§6: the price at the moment the product is
  added is what's copied in), so a draft picked up days later goes out at today's prices. The whole replacement is one
  transaction; a rejected edit leaves the draft exactly as it was. The booker who created the order is never reassigned.

- `POST /api/orders/:id/submit` — submit a draft (`PROJECT_SPEC.md` §13). This is where a draft stops being a work in
  progress: it gets its final `ORD-YYYYMMDD-XXX` number, `submitted_at` is stamped, and it becomes immutable. The
  number is reserved in the same transaction as the status change and the draft row is locked for the duration, so
  concurrent submissions of one draft resolve to exactly one success and one order number — the rest get `409`. The
  draft must hold at least one product (`400` otherwise, §26). Submitting sends the draft **exactly as saved**; it does
  not re-price. `503` if the day's numbers are exhausted, as with `POST /api/orders`.

- `DELETE /api/orders/:id` — delete a **draft** outright, along with its items. This is the one order the application
  physically removes: it was never a real order, holds no order number, and nothing references it. Submitted and
  cancelled orders are kept permanently (`PROJECT_SPEC.md` §12), so this returns `409` for those — unlike customers and
  products, which are soft-deleted.

- `POST /api/orders/:id/cancel` — cancel a **submitted** order (`PROJECT_SPEC.md` §15). The order is kept in full:
  every line, its totals and its order number stay exactly as they were, and that number is never reissued. It is
  marked cancelled and stamped with `cancelled_at` and `cancelled_by` — the authenticated booker, never one named by
  the client (§33). From then on it is excluded from every sales figure (§12). `409` for a draft (delete it instead) or
  for an order already cancelled; the row is locked for the transaction, so concurrent cancellations resolve to exactly
  one recorded cancellation.

**Submitted orders are locked, and the API is what enforces it** (`PROJECT_SPEC.md` §14, §16). Cancelling is the only
operation a submitted order accepts. There is no endpoint that edits one — `PUT`, `DELETE` and `submit` all return
`409` — so the immutability doesn't depend on the UI hiding a button. A mistake is corrected by cancelling the order
and creating a new one.

### What the server decides, and what the client may send

A client sends `customerId`, `status`, `remarks`, and `{ productId, quantity, discount? }` per line. Rate, MRP, bonus
quantity, line totals, order totals, the order number, and the booker are all derived server-side and any such values
in the request body are ignored — a client can't set its own price, award itself a bonus, or book an order in someone
else's name (`PROJECT_SPEC.md` §6, §9, §11, §33). The `quantity` you send is the **paid** quantity; bonus units are
added on top of it, never taken out of it.

**`discount` is the one commercial value a client may set.** It is optional — omit it and the product's own discount
applies, which is what most lines do — and validated like any other input (a number 0–100, rounded to 2 decimals).
Discounting a particular sale is a decision the booker makes at the counter, and §7 only requires that whatever was
used is snapshotted onto the order item, which it is. The rate deliberately does **not** follow: a negotiated discount
is ordinary trade, a client naming its own unit price would make every sales figure meaningless.

### How a line is calculated

For each line, taken from the product's values **at that moment** and then frozen (`PROJECT_SPEC.md` §6, §7, §16):

- `rate` = the product's Sale Price (MRP is snapshotted alongside it for reference, but isn't what the line is priced on)
- `lineSubtotal` = `rate × quantity`
- `lineDiscount` = `lineSubtotal × discount%`, rounded to the nearest paisa — the discount is per product line, never
  applied globally to the order (`PROJECT_SPEC.md` §7)
- `lineTotal` = `lineSubtotal − lineDiscount`
- `bonusQty` = `floor(quantity ÷ purchaseQty) × bonusQty` for the tier that applies to the quantity — the highest of the product's `bonusSchemes` whose `purchaseQty` the quantity reaches — else `0`. With `10 + 1` and `50 + 6`, qty 49 earns 4 (via 10 + 1) and qty 50 earns 6 (via 50 + 6). The tier that applied is what the order item snapshots as `schemePurchaseQty` / `schemeBonusQty`.
  (`PROJECT_SPEC.md` §9). A `20 + 2` scheme gives 2 at qty 20, 4 at qty 40, 2 at qty 25, and 0 at qty 19. Bonus units
  have **zero sales value** — they never appear in any total.
- The order's `subtotal`/`discountTotal`/`total` are the sums of its lines; there is no order-level discount.

All money is computed in integer paisa and converted back to a decimal only at the end. That keeps floating-point drift
out of stored money and guarantees the `total = subtotal - discount_total` (and per-line) check constraints hold exactly
after rounding, instead of failing by a fraction of a paisa.

### Transaction integrity

The order row, all of its items, its totals, and (when submitted) its order number are written in **one** transaction
(`PROJECT_SPEC.md` §30). The customer and products are read on that same transaction's connection, so the values
snapshotted into the items are read and written together. If anything fails — an unknown product, a deactivated one, a
constraint violation, the daily number cap — the whole thing rolls back: no order row, no orphan items, and the
reserved order number is returned to the sequence rather than leaving a gap (verified directly).

### Validation and error responses

`400` with `{ error: { status, message, details } }` (`details` lists every problem found, `message` is the first):

- `customerId` missing/malformed, or naming a customer that doesn't exist or is inactive
- a `productId` that doesn't exist or names a deactivated product — deactivating a product stops it from being ordered,
  while leaving every historical order that references it untouched
- the same `productId` listed twice (list each product once with its total quantity; merging silently would make the
  saved order differ from the one the user reviewed)
- `quantity` missing, non-integer, `<= 0`, or above 1,000,000
- `items` not an array, more than 200 items, or an empty `items` on a **submitted** order (empty drafts are fine)
- `status` other than `draft`/`submitted` — an order can never be created already cancelled
- `remarks` over 1000 characters
- an order total beyond what the money columns can hold, caught before it reaches the database

`503` is returned in one case: 999 orders already exist for the current day, so no valid `ORD-YYYYMMDD-XXX` number is
left to issue. Nothing is saved, and the sequence resets at midnight. Drafts are unaffected — they never take a number.

### Not in this stage

Editing a draft, deleting a draft, submitting an existing draft, and cancelling a submitted order aren't exposed as
routes yet — `submitOrder()`/`cancelOrder()` exist at the model layer (see [Order Numbering](#order-numbering)) and get
their endpoints in Stages 6/7, along with the Orders UI. Submitted orders are already immutable in practice: there is
no route that can change one.

### Create Order UI

`/orders/new` (sidebar: **Create Order**), built from `frontend/src/pages/orders/`. This is the screen a booker spends
the day in, so it is laid out as a two-column workspace rather than a form: **products on the left, the order being
built on the right**. Searching never pushes the order off screen, and the running total is always visible.

- `CreateOrder.jsx` — the workspace: state, the cart, the summary and the save actions. Also serves
  `/orders/drafts/:id/edit` (see [Draft Orders UI](#draft-orders-ui)).
- `ProductBrowser.jsx` — the left column. The search box **takes focus on arrival**, the list is populated before
  anything is typed, and a company filter narrows it. Each row shows name, code, packing/unit, company, rate, any
  product discount, and the scheme as a `20 + 2` badge — plus how many are already on the order, so a booker can see
  at a glance what they've added. **Fully keyboard-driven**: <kbd>↑</kbd>/<kbd>↓</kbd> move the highlight,
  <kbd>Enter</kbd> adds, focus stays in the search box, and the search text is deliberately *not* cleared — adding
  several strengths of the same medicine is the common case. Adding a product already on the order bumps its quantity
  rather than making a second line.
- `CustomerPicker.jsx` — unchanged searchable dropdown (name or code), now at the top of the cart.
- `orderCalc.js` — the live preview maths, mirroring the backend's `orderPricing.js` signature for signature.

**Cart line controls**: a `− [qty] +` stepper alongside a direct number input (steppers for one-at-a-time, typing for
"40"), an editable **discount %** box that re-prices the line as you type, a green **`+2 Bonus Free`** badge when a
scheme applies (or a muted `20+2 scheme` reminder when the quantity isn't there yet), the line total, and a single-click
`×` to remove. Invalid quantities and discounts are flagged in the box itself.

**Summary**: Items, Paid Qty, Bonus Qty, Subtotal, Discount, then the **Grand Total** in a dark navy block — the one
number the screen exists to produce — followed by Remarks and the Save as Draft / Submit Order pair.

**Empty state**: "No items added yet", with the keyboard hint, rather than a blank panel.

**Responsive**: below 1100px the columns stack with the **order first** — what has been added matters more than the
catalogue when there's no room for both. The cart is sticky above that width so the total never scrolls away.

**No sales arithmetic is trusted from here.** The preview is local so figures move as you type, but the server
recalculates every line on save and its numbers are what the success banner reports.

### Draft Orders UI

`/orders/drafts` (sidebar: **Draft Orders**), from `frontend/src/pages/orders/`. Covers every action
`PROJECT_SPEC.md` §13 asks for.

- `DraftOrders.jsx` (`/orders/drafts`) — the list: when it was saved, customer, booker, item count, total and remarks,
  with a debounced customer search and Previous/Next pagination. Each row has **View**, **Continue**, **Submit** and
  **Delete**. Submit and Delete both go through a confirmation dialog (§25) that states exactly what will happen — the
  submit dialog quotes the customer, item count and grand total, and says the order becomes uneditable. Submit is
  disabled on an empty draft with a tooltip explaining why, rather than letting the request fail. Same
  loading/error(+Retry)/empty states and out-of-range-page snap-back as the other lists.
- `DraftDetails.jsx` (`/orders/drafts/:id`) — read-only view of one order: status pill, customer and booker, timestamps,
  remarks, every line with rate/paid qty/scheme/bonus/line total, and the same summary figures as Create Order, with
  Continue Editing, Submit Order and Delete Draft. It renders whatever status the order actually is, so a stale link to
  a draft that has since been submitted shows the submitted order correctly — without the draft-only actions.
- `CreateOrder.jsx` (`/orders/drafts/:id/edit`) — the Create Order screen in edit mode. It loads the draft, fetches all
  its products in one `ids` request, and rebuilds the lines from the products' **current** values. Two things get
  called out rather than happening silently:
  - **Re-priced lines**: if a product's price, discount or scheme has changed since the draft was saved, a banner names
    those products and says the figures shown are what will be saved.
  - **Withdrawn products**: a product deactivated since the draft was saved can't be ordered any more, so its line is
    dropped and the banner says which — instead of failing on save with a server error.

  Editing a submitted order isn't possible: the screen detects it and offers to view the order instead. **Save Draft**
  keeps it a draft; **Submit Order** saves the on-screen contents first and then submits, so what was reviewed is
  exactly what gets finalized, and lands on the order's own page where the new order number is shown.

**Two ways to submit, and why they differ**: submitting from the list or the detail view sends the draft *exactly as
saved* — the total in the confirmation dialog is the total that gets stored. Continuing a draft first re-prices it at
today's values, which is what §6 prescribes for the moment a product is added to an order. Both paths show the booker
the figures they're committing to before they commit, which is the property that matters.

### Order Receipt (share / export)

A printable receipt for a submitted order, exportable as PDF or JPG and shareable to WhatsApp. Reached from
**Share / Export** on the order's detail page, or **Share** on its row in the Orders list. From
`frontend/src/components/orders/`.

- `receiptData.js` — flattens an order into exactly what a receipt prints. Every
  amount is the snapshot stored on the order, never recomputed from the product: a receipt for a six-month-old order
  must show the prices it was actually placed at (`PROJECT_SPEC.md` §16).
- `receiptPdf.js` — draws the PDF with jsPDF's own primitives.
- `OrderReceiptModal.jsx` — the on-screen preview and the three actions.

**The receipt is rendered twice, on purpose.** The HTML version drives the on-screen preview and the JPG; the PDF is
drawn as real vector text. The obvious alternative — screenshot the HTML with html2canvas and paste that bitmap into a
PDF — is one less layout to maintain, but produces *a picture of a receipt*: fuzzy when zoomed, unselectable,
unsearchable, and hundreds of kilobytes. A receipt gets printed, forwarded and read on a phone, so it's worth drawing
properly. The real PDF is ~15 KB for a 7-line order with selectable text; it paginates, repeating the table header, and
numbers its pages. **Both renderers take their figures from `buildReceipt()`** — two layouts is the accepted cost, two
sets of arithmetic would be a bug waiting to happen.

**Design**: dark navy (`#0F172A`) header band and totals block, `#1E3A8A` table header, white ground, charcoal text.
Header carries the booker's company name (see [Company branding](#company-branding)), order number, date and a status chip (green Submitted / red Cancelled); then Bill To and
Booked By; then the line table — Product, Rate, Paid Qty, Bonus, Disc %, Line Total; then remarks beside the totals
block, ending in the grand total. Bonus quantity is a green `+N` pill in both renderers, never a plain number, because
free stock must not read as another figure that was paid for.

**html2canvas constraints** shaped the CSS: it re-implements CSS to rasterise a node and silently drops what it can't
parse, so every receipt rule uses plain hex and px, and the receipt is a **fixed 760px wide** — one that reflowed with
the browser window would export differently depending on who pressed the button.

**WhatsApp**: no web API can hand a file to WhatsApp from a link. So the flow is: generate and download the receipt
image, then open `web.whatsapp.com` for the user to pick a chat and attach it — with no number to target, `wa.me`
and `api.whatsapp.com/send` land on a marketing page or a download prompt, while this opens straight into the chat
list for an already-signed-in user. Nothing is pre-filled and no
number is targeted — the booker chooses the recipient in WhatsApp itself, where their real contact list is, rather
than through a number typed into this app that may be incomplete or missing a country code. The customer's phone
still prints on the receipt itself, under Bill To.

**Bundle cost**: `jspdf` (390 KB) and `html2canvas` (201 KB) are loaded with dynamic `import()` inside the export
handlers, so they build as separate chunks and never load for the many sessions that don't export a receipt.

**Availability**: submitted orders only, from both the list and the detail view. Drafts have no order number and aren't
orders yet; the modal renders a cancelled order correctly (red chip, "not payable" line, a warning in the WhatsApp
text) should one be reached, but no button offers it.

### Orders UI

`/orders` (sidebar: **Orders**), from `frontend/src/pages/orders/`. This is the Orders module of
`PROJECT_SPEC.md` §17 — submitted orders and their statuses. Drafts are not orders yet and stay on their own page.

- `OrderList.jsx` (`/orders`) — order number, date, customer, booker, item count, total and a status badge, newest
  first, paginated. A filter bar carries all four filters §17 asks for plus search, and they all combine:
  - **Status** — All (submitted + cancelled), Submitted, or Cancelled
  - **Customer** — the same searchable picker Create Order uses, so a long customer list stays workable
  - **Booker** — populated from `GET /api/users`; inactive bookers are marked, since they still own past orders
  - **Date range** — From/To date pickers that bound each other, plus a **Today's Orders** shortcut (§17)
  - **Search** — order number, customer name or code

  A failure to load the booker list costs only that one filter and never takes the page down. **Cancel** sits on each
  submitted row behind a confirmation dialog that names the order, customer and grand total and says the order is kept
  but excluded from all sales figures. There is deliberately no Edit action anywhere on this page.
- `OrderDetails.jsx` (`/orders/:id`) — the single detail view for **every** order, whatever its status, showing the
  customer, booker, timestamps, remarks, every line with its historical snapshot, and the full summary. It offers only
  what the status permits, so a link never leads anywhere misleading:
  - **draft** → Continue Editing, Submit Order, Delete Draft
  - **submitted** → Cancel Order, plus a note that the order is locked and a mistake is corrected by cancelling and
    re-creating
  - **cancelled** → read-only, with a banner giving the cancellation time and who did it

  `/orders/drafts/:id` still resolves here too, so links saved before this stage keep working. (It replaced the
  near-identical `DraftDetails.jsx` from Stage 6 — two detail views that had to be kept in step was the wrong shape.)
- `OrderStatusBadge.jsx` — the one place a status becomes a badge, so Draft (amber), Submitted (green) and Cancelled
  (red) look identical everywhere they appear (§25). Cancelled rows are additionally greyed with the total struck
  through, so a cancelled order can be read in full but never mistaken for one that counts.

## Reports API

`GET /api/reports?type=…&dateFrom=…&dateTo=…&page=…&limit=…` — requires `Authorization: Bearer <token>`.

`type` selects the grouping (default `daily`): `daily`, `monthly`, `customer`, `product`, `booker`, `range`.
`dateFrom`/`dateTo` are inclusive `YYYY-MM-DD` calendar dates (`400` if malformed, impossible, or reversed); omit both
for all time. Rows are paginated (`limit` default 50 / max 200) — note the pagination `total` counts **groups**, not
orders.

Every response carries the same envelope:

```json
{
  "type": "daily",
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-31",
  "summary": { "orders": 2, "sales": 13000, "subtotal": 14000, "discountTotal": 1000, "paidQty": 25, "bonusQty": 2 },
  "rows": [{ "period": "2026-03-10", "orders": 2, "sales": 13000 }],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

`summary` always covers the **whole period**, not the current page, so a paginated table still shows a true grand
total. For `type=range` the summary *is* the report — "Date-range Sales" (§18) is the totals for a chosen period, not
a different grouping — and `rows` is empty. Row shapes per type: `daily` → `period`/`orders`/`sales`; `monthly` →
`period`/`year`/`month`/`orders`/`sales`; `customer` → customer id/name/code + `orders`/`sales`; `product` → product
id/name/code + `paidQty`/`bonusQty`/`orders`/`sales`; `booker` → booker id/name/username + `orders`/`sales`.

### The definition of a valid sale

`backend/src/models/report.js` is the only place this is defined. `PROJECT_SPEC.md` §34 requires the Dashboard, Sales
Reports and Targets to agree exactly — "do not implement separate formulas for each screen" — so every screen's
figures come from here, and nothing outside that file writes its own SUM over orders.

- **Only `submitted` orders count.** Drafts aren't sales yet, and a cancelled order stops being one the moment it's
  cancelled (§12, §18). Status is exactly one of three values, so `status = 'submitted'` excludes both.
- **Bonus quantities have zero sales value.** This needs no special case: a line's stored `line_total` is derived from
  the *paid* quantity alone, so bonus units can never reach a total. Bonus is reported as a quantity, never as money.
  (Tested directly: a scheme granting 100 free units adds `0` to sales.)
- **Discounts reduce the line's value.** `line_total = line_subtotal - line_discount` and an order's total is the sum
  of its lines, so summing either column already has discounts applied. The summary still breaks `subtotal` and
  `discountTotal` out separately.
- **Amounts are the snapshots taken at order time** (§16), so a later price or discount change can never move a
  historical figure.

**A sale's date is when the order was submitted**, not when its draft was created — an order drafted in January and
submitted in February is a February sale. That is also the date its `ORD-YYYYMMDD-XXX` number was issued against, and
(as of this stage) the date the Orders list filters on, so no two screens disagree about which day an order belongs to.
Product-wise sales group by product **id** and label with the product's current name, so a renamed product stays one
row while its money stays historical.

### Sales Reports UI

`/reports` (sidebar: **Sales Reports**), from `frontend/src/pages/reports/SalesReports.jsx`.

Six tabs, one per report in §18. Each tab is just a column definition — the date range, totals strip, paging and the
loading/empty/error states are shared, so the tabs cannot drift apart:

| Tab | Columns |
| --- | --- |
| Daily | Date · Valid Orders · Sales |
| Monthly | Month · Valid Orders · Sales |
| Customer-wise | Customer (name + code) · Orders · Sales |
| Product-wise | Product (name + code) · Paid Qty Sold · Bonus Qty · Sales |
| Booker-wise | Booker · Orders · Sales |
| Date Range | *(the totals strip is the report)* |

A From/To date range applies to **every** tab, with Today / This Month / This Year / All Time presets. Above the table
sits a totals strip — Valid Orders, Gross, Discount, **Total Sales**, Paid Qty Sold, Bonus Qty (free) — covering the
whole selected period, not just the visible page, with a line underneath restating the rules in plain words. In the
Product-wise tab the bonus column renders as a green `+N` badge rather than a number in a money column, so it reads as
a free quantity next to the sales figure it contributed nothing to.

**No sales arithmetic runs on the client.** Unlike the Create Order screen — which necessarily previews line totals
locally — this page only formats what the API returns. There is no second implementation of the sales rules to keep in
step.

## Targets API

Monthly targets (`PROJECT_SPEC.md` §19), at two scopes: the month **overall**, or one **manufacturer** within it.
Company-wise targets are an approved extension to the original overall-only target and are recorded in §19 itself.
There are still no booker targets and no area targets (§20).

- `GET /api/targets?year=&month=&scope=` — a month's targets with what was actually achieved. `year`/`month` default
  to the current month; `scope` is `all` (default — overall plus every company) or `overall`. Returns
  `{ year, month, scope, overall, companies: [...] }`, where each row carries
  `{ id, scope, company, targetAmount, achieved, remaining, achievementPercent, status, orders }`.
- `POST /api/targets` — create a target that doesn't exist yet. Body `{ year, month, company?, targetAmount }`;
  `409` if one already exists for that month and scope.
- `PUT /api/targets` — **set** the target for a month and scope, creating it if absent. Addressed by scope rather than
  id because that's what the caller knows ("the October target for GSK"), and it makes the form idempotent — saving
  twice sets the same value instead of failing.
- `PUT /api/targets/:id` — change an existing target's amount only. Moving a target to a different month or company
  would silently change which sales it is measured against, so that isn't an edit.
- `DELETE /api/targets/:id` — remove a target. Targets hold no history of their own (the orders they measure are
  untouched), so unlike an order this is a real delete.
- `GET /api/products/companies` — the distinct manufacturers products are assigned to; the options a company target
  can be set against. Company is a field on the product (§5), not an entity — there is deliberately no companies table.

**Scope rules.** `company` absent, `null`, or blank all mean the month's overall target, so an empty form field can't
create a target for a company named `""`. A month has at most one overall target and at most one per company, enforced
by a unique index on `(year, month, lower(coalesce(company, '')))` — `COALESCE` because SQL treats NULLs as distinct
and would otherwise allow several "overall" targets, and `lower` because manufacturer names are typed by hand in two
unrelated places, so `GSK` and `gsk` must be one target rather than two each claiming the same sales.

**Company targets are independent of the overall target.** They don't have to add up to it and the overall target is
never derived from them: products with no company recorded contribute to the overall figure only. A company target is
attributed by each product's *current* manufacturer — products don't snapshot their company (it isn't a commercial
value under §16), so correcting a product's manufacturer moves its past sales to the corrected company. The money on
each line is untouched.

### Target calculations

All of it in `backend/src/models/target.js`'s `computeProgress`, so the Targets page and the Dashboard cannot compute
it differently:

- **Achieved** — valid sales for the month, from `report.js`. For a company target, only that manufacturer's product
  lines. Aggregated over lines rather than orders so overall and company-wise use one code path — exact, not an
  approximation, since an order's total is the sum of its line totals by database constraint. Drafts and cancelled
  orders excluded, bonus quantities worth nothing, line discounts already deducted.
- **Remaining** = `Target − Achieved`, returned raw, so an exceeded target reads as a negative number the UI shows as
  "exceeded by".
- **Achievement %** = `(Achieved / Target) × 100`, **or `null` when the target is zero or unset** — §19 requires
  zero-target handling, and an undefined percentage is not an infinite one. Tests assert no `NaN` or `Infinity` ever
  appears in a response.
- **Status** — `achieved`, `in-progress`, `not-started`, or `no-target`. Decided server-side so every screen labels a
  month the same way.

### Targets UI

`/targets` (sidebar: **Targets**), from `frontend/src/pages/targets/Targets.jsx`.

Month and year pickers with a view switch (overall + company-wise, or overall only). A **Set a target** form takes a
scope — "Overall (all companies)" or one manufacturer from `GET /api/products/companies` — and an amount; saving
replaces the target for that month and scope. Below it, one progress card per scope (achievement % as the headline,
a progress bar capped at 100% width so an overachieving month doesn't overflow while the figure beside it still reads
true, then Target / Achieved / Remaining / Valid Orders), and a table with Target, Achieved, Remaining, Achievement %,
Status and per-row Edit / Set Target / Remove. Rows for manufacturers that sold this month but have no target show
`No Target Set` with a `Set Target` action — those rows are the reason to open the page. An exceeded target renders as
a green `+amount` rather than a negative, because exceeding a target is good news. **No target or sales arithmetic runs
on the client**; the page only formats what the API returns.

## Dashboard API

`GET /api/dashboard` — requires `Authorization: Bearer <token>`. The operational overview of `PROJECT_SPEC.md` §3, in
one request:

```json
{
  "date": "2026-09-06", "year": 2026, "month": 9,
  "today":   { "orders": 8, "sales": 98100 },
  "monthly": { "orders": 8, "sales": 98100 },
  "target":  { "id": "…", "targetAmount": 122625, "achieved": 98100,
               "remaining": 24525, "achievementPercent": 80, "status": "in-progress" },
  "draftOrders": 1,
  "recentOrders": [ /* the 8 most recent submitted/cancelled orders */ ]
}
```

**This endpoint computes nothing of its own.** Every figure is assembled from the module that already owns it —
today's and this month's sales from `models/report.js`, the target arithmetic from `models/target.js`, the draft count
and recent orders from `models/order.js`. That is the design: §34 requires the Dashboard, Sales Reports and Targets to
agree exactly and forbids a formula per screen, so the Dashboard has no sales arithmetic to get wrong. Drafts and
cancelled orders are excluded, bonus quantities are worth nothing and line discounts are already deducted **because
those modules do that**, not because this file repeats the rules.

"Today" and "this month" come from the database's own clock — the same reference the sale dates and the daily
`ORD-YYYYMMDD-XXX` sequence use — so the Dashboard can't disagree with a report about which day it is at a boundary.
Recent orders exclude drafts (they aren't orders yet and have their own count and page) but include cancelled ones,
shown struck through for context.

### Dashboard UI

`/` (sidebar: **Dashboard**), from `frontend/src/pages/Dashboard.jsx`. Quick Actions sit in the page header —
**Create Order**, Customers, Products, Orders (§3, in that order). Below them a stat strip (Today's Orders, Today's
Sales, this month's Orders and Sales, and a Draft Orders tile that links through to the drafts page), then the monthly
target with a progress bar, then Recent Orders with status badges linking to each order. When no target is set for the
month the card says so and links to `/targets` rather than showing a broken percentage. Loading, error-with-Retry and
empty states throughout; nothing on the page does sales arithmetic.

## API Structure

- All routes are mounted under `/api` via `backend/src/routes/index.js`. Add new domain routers there in later stages (reports, targets, ...).
- Route handlers that need to report an error should `throw new ApiError(statusCode, message)` (see `backend/src/utils/ApiError.js`), wrapping async handlers with `asyncHandler` (see `backend/src/utils/asyncHandler.js`) so the error reaches the centralized handler in `backend/src/middleware/errorHandler.js`.
- Error responses have a consistent shape: `{ "error": { "status": <code>, "message": "..." } }`. Unknown routes return a 404 in the same shape via `backend/src/middleware/notFoundHandler.js`.
- The frontend calls the API through `frontend/src/api/client.js`, a small `fetch` wrapper that reads `VITE_API_BASE_URL`, throws on non-2xx responses (using the error message above when present), and exposes `get`/`post`/`put`/`delete` helpers.

## UI Conventions & QA

A pass over every module (Stage 10) checked five things and fixed the gaps:

- **Loading states** — every page that fetches shows one. Searches inside Create Order (customer and product pickers)
  show their own, so the page never looks frozen while typing.
- **Error states with Retry** — every load failure offers a way to recover without a browser reload. Five screens had
  an error message with only a "Back" link and now have Retry: Customer Details, Edit Customer, Product Details, Edit
  Product, and the Continue-Draft load in Create Order.
- **Empty states** — distinguish "nothing matches your filter" from "nothing exists yet", and say what to do next.
  Lists that can be emptied by an action (deactivating or deleting the last row on a page) snap back to a valid page
  rather than stranding you on an empty one.
- **Error boundary** — `components/ErrorBoundary.jsx` wraps the whole route tree. A render-time crash now shows a
  recoverable screen with Try Again / Reload instead of blanking the app. Error boundaries must be class components;
  there is no hook equivalent.
- **Confirmation dialogs** — before every destructive or irreversible action: deactivating a customer or product,
  deleting a draft, clearing a part-built order, submitting a draft or an order, cancelling an order, removing a
  target. `ConfirmDialog` takes a `confirmVariant` so irreversible-but-not-destructive actions (submitting) are styled
  as primary rather than danger, and each dialog states what will actually happen — the submit dialog quotes the
  customer, item count and grand total.

**Responsive**: below 900px the shell stacks and the sidebar becomes a horizontal scrolling strip, so the order tables
get the full width. Below 640px form and detail grids collapse to one column, action buttons go full-width, and row
actions wrap. Wide tables scroll inside their own container throughout rather than pushing the page sideways.

**404**: an unknown URL gets a real "Page not found" screen. It previously reused a shared module placeholder, which
told users the page "will be implemented in a later development stage" — misleading for a typo. That placeholder
component has since been removed along with the `/prices` route, its last remaining caller, so every route in the
navigation now leads to a real screen.

## Environment Variables

Each app has its own `.env.example`:

- `backend/.env.example` — server port, CORS origin, PostgreSQL connection settings, and `JWT_SECRET`/`JWT_EXPIRES_IN` for authentication.
- `frontend/.env.example` — API base URL used by the frontend.

Copy each to `.env` in the same folder and adjust as needed. Never commit `.env` files.

## Known Issues

- `npm audit` reports a few moderate/high advisories in transitive dependencies (`qs`/`body-parser` behind `express` in the backend; `esbuild`/`react-router` behind `vite`/`react-router-dom` in the frontend). No non-breaking fix is currently available (`npm audit fix` makes no changes); the only fixes require a major upgrade (Express 5, Vite 6+, React Router 7). Not addressed in this stage to avoid an unrequested breaking change — revisit in a maintenance pass.
- `xlsx` (SheetJS), added for the bulk product import, is pinned at 0.18.5 — the newest version published to the npm
  registry. SheetJS moved later releases to their own CDN, so `npm audit` reports advisories against it with no npm
  upgrade available. The exposure here is limited: the parser only ever sees a file an authenticated booker uploaded
  through the import modal, uploads are capped at 5 MB and 1000 rows, and the parsed values are validated before
  anything reaches the database. Worth revisiting by installing from SheetJS's CDN if that risk profile changes.

- No PostgreSQL server is bundled; you need one running locally (or reachable) for `npm run migrate:up`, `npm run db:test`, and `/api/health/db` to succeed. The rest of the app works without it.

## Development Approach

This project is built incrementally, one stage at a time, per `PROJECT_SPEC.md` §40. Do not add business logic ahead of the current stage.
