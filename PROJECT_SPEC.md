# Medicine Order Booking App — Master Specification

**Document Status:** Master Product & Technical Specification  
**Purpose:** Single source of truth for development, maintenance, debugging, and future feature work.  
**Application Type:** Standalone, open-source medicine distribution order-booking application.

---

## 1. Core Product Definition

This application is a complete standalone order-booking and basic sales-management system for a medicine distribution business.

The application is **not connected to any external company, ERP, accounting software, Odoo, Shopify, SAP, API, or third-party business system**.

The user who installs/uses the application manages the application's own data from inside the same application.

There is **one application structure**. Do not create a separate Admin Panel or Management Panel.

### Main Modules

1. Dashboard
2. Customers
3. Products
4. Prices
5. Create Order
6. Draft Orders
7. Orders
8. Sales Reports
9. Targets

### Explicitly Excluded

- Stock management
- Available stock
- Inventory management
- Role-based access control
- Areas/Territories
- Customer assignment by territory
- Booker Targets
- Area Targets
- External software integrations
- Separate management/admin panel

---

# 2. Users / Bookers

The application is intended to be used by bookers.

A basic user/booker system is required for login and identifying who created an order.

### Booker Data

At minimum:

- ID
- Name
- Username
- Password hash
- Contact number (if required)
- Active/Inactive status
- Created date
- Updated date

### Important

There are no complex roles or permission levels.

Do not introduce RBAC unless explicitly requested later.

The system should still record the responsible booker on orders.

---

# 3. Dashboard

The dashboard provides a quick operational overview.

### Required Information

- Today's Orders
- Today's Sales
- Monthly Orders
- Monthly Sales
- Monthly Target
- Target Achieved
- Remaining Target
- Achievement Percentage
- Draft/Pending Orders
- Recent Orders

### Quick Actions

- Create Order
- Customers
- Products
- Orders

Dashboard figures must use the same business rules as Sales Reports.

Cancelled orders must not contribute to sales totals.

---

# 4. Customers

Customers represent the pharmacies/chemists/medical customers for whom orders are booked.

## Customer List

Display useful information such as:

- Customer Name
- Customer Code
- Contact Number
- Address
- City/Area
- Customer Type
- Total Orders
- Total Sales
- Status

## Customer Operations

- Add Customer
- View Customer
- Edit Customer
- Delete Customer
- Search Customer
- Filter Customer
- View Customer Order History
- Re-order from previous order

## Customer Details

Customer details should include:

### Basic Information
- Customer Name
- Customer Code
- Customer Type
- Status

### Contact Information
- Contact Person
- Phone
- Alternate Phone (if required)

### Address
- Address
- City/Area

### History
- Total Orders
- Total Sales
- Previous Orders
- Order details

### Re-order

A previous order can be used as the basis for creating a new order.

Re-order creates a **new order**. It must never modify the historical order.

Current product pricing and current applicable scheme should be used when creating the new order.

---

# 5. Products

Products represent medicines/items sold by the distributor.

## Product Fields

At minimum:

- ID
- Product Name
- Product Code
- Company/Manufacturer
- Packing
- Unit
- MRP
- Sale Price
- Discount
- Bonus Scheme
- Active/Inactive status
- Created date
- Updated date

Additional product fields should not be invented unless required by the business.

## Product Operations

- Add Product
- View Product
- Edit Product
- Delete/Deactivate Product
- Search Product
- Filter Product
- Activate/Deactivate Product

### Product Search

Because a medicine distributor may have many products, search should be fast.

Search should support:

- Product Name
- Product Code
- Company/Manufacturer

Inactive products should not normally be selectable for new orders.

Historical order items must remain visible even if their product is later deactivated.

---

# 6. Prices

Prices are product-specific.

The application navigation should contain a separate **Prices** section for convenient bulk viewing/management, while the current price also belongs to the Product.

## Price Information

- Product
- MRP
- Sale Price
- Discount

### Price Rule

When a product is added to an order:

**The current product price at that exact moment is copied into the Order Item.**

After the order is submitted, the order's price is locked.

Changing the product's price later must never change an existing order.

Example:

Product price on September 1 = Rs. 500

Order created on September 1 = Rs. 500

Product price changed on September 5 = Rs. 550

Old order must remain = Rs. 500.

---

# 7. Product-wise Discount

Discount is applied **per product/order line**, not globally to the complete order.

Example:

Product A:
- Rate = 500
- Quantity = 10
- Discount = 10%

Product B:
- Rate = 800
- Quantity = 5
- Discount = 5%

Each line calculates its own discount and total.

The order total is the sum of its order-line totals.

Discount values used in a submitted order must be stored with the order item so historical orders remain unchanged.

---

# 8. Product-wise Bonus Scheme

Bonus schemes are configured per product.

The user sets the scheme on the product.

### Scheme Fields

- Scheme Enabled: Yes/No
- Purchase Quantity
- Bonus Quantity

Example:

Purchase Quantity = 20  
Bonus Quantity = 2

This represents:

**20 + 2**

Other examples:

- 20 + 1
- 30 + 1
- 50 + 5

Different products can have different schemes.

Example:

Product A → 20 + 2  
Product B → 20 + 1  
Product C → 30 + 1  
Product D → No Scheme

---

# 9. Automatic Bonus Calculation

When a product is added to an order, its current bonus scheme is applied automatically.

### Calculation

If:

- Scheme Purchase Quantity = P
- Scheme Bonus Quantity = B
- Ordered Quantity = Q

Then:

**Bonus Quantity = floor(Q / P) × B**

Examples:

20 + 2:
- Qty 20 → Bonus 2
- Qty 40 → Bonus 4
- Qty 60 → Bonus 6
- Qty 25 → Bonus 2
- Qty 19 → Bonus 0

Bonus quantity must be calculated automatically.

### Important

Bonus quantity is not the same as paid quantity.

If:
- Ordered/Paid Quantity = 20
- Bonus Quantity = 2

Then total physical quantity = 22, but sales value is calculated only from the paid quantity (20), not the bonus quantity.

Bonus quantity has zero sales value.

### Scheme Snapshot

When a product is added to a submitted order, the applicable scheme values must be stored with the order item.

Changing the product's scheme later must not change old orders.

---

# 10. Create Order

This is the core feature of the application.

## Order Flow

1. Select Customer
2. Search/select Products
3. Add Product
4. Enter Quantity
5. System loads current price
6. Product-wise discount applies
7. Product-wise bonus scheme calculates automatically
8. Add more products if needed
9. Enter remarks if needed
10. Review Order Summary
11. Save as Draft OR Submit Order

## Order Item

Each order line should store a historical snapshot of:

- Product ID
- Product Name at order time
- Product Code at order time (where useful)
- Packing at order time (where useful)
- Rate/Price at order time
- MRP at order time (where useful)
- Paid Quantity
- Bonus Quantity
- Discount
- Scheme purchase quantity
- Scheme bonus quantity
- Line subtotal
- Line discount
- Line total

The exact schema may normalize product references while retaining the necessary snapshots for historical accuracy.

---

# 11. Order Number

Order numbers are automatically generated.

Required format:

**ORD-YYYYMMDD-XXX**

Examples:

- ORD-20260904-001
- ORD-20260904-002
- ORD-20260904-003

The sequence resets for each calendar day.

Next day:

- ORD-20260905-001
- ORD-20260905-002

### Important

Multiple orders from the same customer on the same day are allowed.

Each receives a unique order number.

Order number generation must be safe against duplicate numbers when multiple orders are created concurrently.

---

# 12. Order Status

Initial statuses:

- Draft
- Submitted
- Cancelled

### Draft

A draft order:

- Can be opened
- Can be edited
- Can have products added/removed
- Can have quantities changed
- Can be deleted
- Can be submitted

### Submitted

A submitted order:

- Cannot be edited
- Remains permanently stored
- Can be viewed
- Can be cancelled

### Cancelled

A cancelled order:

- Cannot be edited
- Remains stored in the database
- Is excluded from sales calculations
- Is clearly marked as Cancelled

Do not physically delete submitted/cancelled orders.

---

# 13. Draft Orders

Draft Orders are incomplete orders saved for later.

Required actions:

- View Drafts
- Open Draft
- Edit Draft
- Continue Order
- Delete Draft
- Submit Draft

Drafts do not count as completed sales.

A draft may not need a final order number until submission. If an order number is assigned earlier, the implementation must still preserve uniqueness and clear status semantics.

Preferred behavior:

**Generate the final order number when the order is submitted.**

---

# 14. Submitted Order Editing Rule

Submitted orders are **NOT editable**.

This is a strict business rule.

If the user made a mistake:

- Cancel the submitted order
- Create a new order

Do not allow direct modification of the submitted order's products, quantity, price, discount, or bonus.

---

# 15. Order Cancellation

Submitted orders can be cancelled.

Cancellation should preserve the complete original order.

Recommended fields:

- Cancelled At
- Cancellation Reason (if enabled later)
- Cancelled By (booker/user)

A cancelled order remains available in order history.

Cancelled orders must not contribute to:

- Sales Reports
- Today's Sales
- Monthly Sales
- Target Achievement

---

# 16. Historical Data Locking

Once an order is submitted, historical commercial values are locked.

At minimum, the submitted order must preserve:

- Product
- Price
- Quantity
- Bonus
- Discount
- Applicable scheme
- Line total
- Order total

Later changes to Products, Prices, Discounts, or Schemes must not modify historical submitted orders.

This is one of the most important data-integrity rules in the application.

---

# 17. Orders Module

The Orders module displays submitted orders and their statuses.

## Required Views/Functions

- All Orders
- Today's Orders
- Order Search
- Order Details
- Date Filter
- Customer Filter
- Booker Filter
- Status Filter
- Cancel Order

## Order Details

Display:

- Order Number
- Date/Time
- Customer
- Booker
- Products
- Paid Quantity
- Bonus Quantity
- Rate
- Discount
- Scheme
- Line Totals
- Grand Total
- Status
- Remarks

---

# 18. Sales Reports

Sales Reports are calculated from orders.

### Required Reports

1. Daily Sales
2. Monthly Sales
3. Customer-wise Sales
4. Product-wise Sales
5. Booker-wise Sales
6. Date-range Sales

### Sales Rules

Only valid submitted orders count toward sales.

Cancelled orders are excluded.

Draft orders are excluded.

Bonus quantities have zero sales value.

Discounts reduce the relevant product line's sales value.

### Daily Sales

Show:

- Date
- Number of valid orders
- Sales amount

### Monthly Sales

Show:

- Month
- Number of valid orders
- Sales amount

### Customer-wise Sales

Show:

- Customer
- Orders
- Sales

### Product-wise Sales

Show:

- Product
- Paid Quantity Sold
- Bonus Quantity
- Sales

### Booker-wise Sales

Show:

- Booker
- Orders
- Sales

### Date-range Sales

Allow a custom start and end date.

---

# 19. Targets

Targets are simple monthly targets.

There are **NO Booker Targets** and **NO Area Targets**.

## Monthly Target

Fields:

- Month
- Year
- Target Amount
- Created/Updated timestamp

## Calculations

**Achieved = valid sales during the selected month**

**Remaining = Target - Achieved**

**Achievement % = (Achieved / Target) × 100**

If target is zero, avoid division-by-zero errors.

Target achievement must use the same sales rules as Sales Reports.

---

# 20. Areas / Territories

There is intentionally **NO Areas/Territories module**.

Do not create:

- Areas
- Territories
- Customer assignment by territory
- Area targets

If a simple customer address/area text field is required, it is only customer information and must not become a territory-management system.

---

# 21. Stock / Inventory

There is intentionally **NO stock system**.

Do not implement:

- Available stock
- Stock quantity
- Inventory
- Warehouse
- Stock movements
- Purchase inventory
- Batch inventory
- Expiry tracking

The application only handles order booking and sales-related information.

---

# 22. External Integrations

The application is fully standalone.

Do not implement integrations with:

- Odoo
- Shopify
- SAP
- QuickBooks
- Xero
- Accounting software
- ERP
- External order systems
- External inventory systems
- External company APIs

No external synchronization is required.

---

# 23. Application Navigation

The application should have one unified navigation structure.

Recommended main navigation:

```text
Dashboard
Customers
Products
Prices
Create Order
Draft Orders
Orders
Sales Reports
Targets
```

No separate Admin Panel.

No separate Management Panel.

---

# 24. Settings

A minimal Settings section may exist for application-level settings only.

Do not put business modules inside Settings.

Possible settings can include:

- Application name
- General preferences
- Currency
- Date format
- Other non-business configuration

Do not invent complex settings without a requirement.

---

# 25. UI/UX Principles

The application is for frequent daily use by bookers.

Therefore:

- Keep the interface simple.
- Make product search fast.
- Make customer search fast.
- Minimize unnecessary clicks.
- Make Create Order the easiest workflow.
- Clearly show paid quantity and bonus quantity.
- Clearly show discounts.
- Clearly show totals.
- Clearly distinguish Draft, Submitted, and Cancelled.
- Use confirmation dialogs for destructive actions.
- Use validation messages for invalid input.
- Provide loading states.
- Provide empty states.
- Provide useful error messages.
- Make the application responsive.

The UI should be professional and clean rather than overloaded with unnecessary features.

---

# 26. Data Validation

Examples of required validation:

### Customer
- Required customer name
- Appropriate uniqueness rules for customer code
- Valid contact data where required

### Product
- Required product name
- Appropriate uniqueness rules for product code
- Valid numeric prices
- Non-negative quantities/prices
- Valid scheme quantities

### Scheme
Purchase Quantity must be > 0.

Bonus Quantity must be >= 0.

### Order
- Customer required
- At least one product required before submission
- Quantity must be > 0
- Prices must be valid
- Discount must be valid
- Submitted orders cannot be edited

---

# 27. Database Principles

Use a relational database suitable for production.

Recommended default:

**PostgreSQL**

The database should be designed with clear relationships and constraints.

Likely core entities:

- users/bookers
- customers
- products
- orders
- order_items
- monthly_targets

Pricing and scheme data may be modeled inside products or as separate tables depending on the final architecture.

Do not create unnecessary tables.

---

# 28. Important Database Relationships

Conceptually:

```text
User/Booker
    │
    └── creates ──> Orders

Customer
    │
    └── has ──> Orders

Order
    │
    └── contains ──> Order Items

Product
    │
    └── appears in ──> Order Items

Product
    │
    └── has ──> Price / Discount / Bonus Scheme

Monthly Target
    │
    └── compared against ──> Monthly Sales
```

An Order belongs to one Customer.

An Order is created by one Booker/User.

An Order contains one or more Order Items.

An Order Item references one Product but also preserves historical commercial values.

---

# 29. API Principles

Backend should expose clean APIs grouped by domain.

Conceptual areas:

```text
/auth
/users
/customers
/products
/prices
/orders
/reports
/targets
```

Exact endpoints can be finalized during implementation.

APIs must:

- Validate input
- Return consistent responses
- Handle errors properly
- Prevent invalid state transitions
- Protect historical order data
- Use transactions where necessary

---

# 30. Order Transaction Integrity

Submitting an order should be treated as an important database operation.

The following should succeed together:

- Validate order
- Calculate/confirm line values
- Calculate bonuses
- Snapshot commercial values
- Generate unique order number
- Save order
- Save order items
- Mark order as Submitted

If any critical operation fails, the transaction should roll back rather than creating a partially saved submitted order.

---

# 31. Concurrency

Order number generation must handle concurrent order creation.

Two simultaneous submissions must never receive the same order number.

Use database-safe sequencing/locking/unique constraints rather than relying only on frontend calculations.

---

# 32. Security

Even though there is no RBAC, the application still requires normal security.

Minimum requirements:

- Passwords must never be stored in plaintext.
- Use secure password hashing.
- Validate and sanitize inputs.
- Protect authenticated API routes.
- Never expose secrets in frontend code.
- Use environment variables for secrets/configuration.
- Prevent unauthorized modification of submitted orders.
- Use secure session/token handling appropriate to the selected stack.

---

# 33. Auditability

Important actions should be traceable where practical.

At minimum, orders should retain:

- Created timestamp
- Submitted timestamp
- Created by Booker/User
- Cancelled timestamp when cancelled
- Cancelled by Booker/User when applicable

Do not over-engineer a full audit-log system unless required later.

---

# 34. Reporting Consistency

Dashboard, Sales Reports, and Targets must use the same sales calculation rules.

Do not implement separate formulas for each screen.

Create reusable backend/service logic for determining valid sales.

Core rule:

```text
Valid Sales =
Submitted Orders
MINUS
Cancelled Orders
```

Draft orders are excluded.

Bonus quantity contributes zero sales value.

Discount is reflected in the line/order sales amount.

---

# 35. Performance Expectations

The system may contain:

- Thousands of products
- Thousands of customers
- Large order history

Therefore:

- Use database indexes on commonly searched fields.
- Paginate large lists.
- Do not load every product/customer into the browser unnecessarily.
- Use server-side search/filtering for large datasets.
- Optimize report queries.
- Avoid N+1 database queries.

Likely indexed/searchable fields:

- Product name
- Product code
- Customer name
- Customer code
- Order number
- Order date
- Order status
- Booker/user ID
- Customer ID

---

# 36. Error Handling

Errors should be understandable.

Examples:

- Customer not found
- Product not found
- Invalid quantity
- Invalid discount
- Invalid bonus scheme
- Order already submitted
- Submitted order cannot be edited
- Order already cancelled
- Duplicate order number
- Database unavailable

Do not expose sensitive internal stack traces to normal users.

Detailed errors may be logged server-side.

---

# 37. Testing Requirements

Important automated/business tests should cover:

### Product
- Product creation
- Product update
- Product deactivation
- Price update
- Scheme update

### Bonus
- 20 + 2 with quantity 20 → bonus 2
- 20 + 2 with quantity 40 → bonus 4
- 20 + 2 with quantity 25 → bonus 2
- Quantity below scheme threshold → bonus 0
- No scheme → bonus 0

### Orders
- Draft creation
- Draft editing
- Draft deletion
- Draft submission
- Unique order number
- Multiple same-day orders
- Multiple orders for same customer
- Submitted order cannot be edited
- Submitted order can be cancelled
- Cancelled order remains stored

### Historical Values
- Product price changes after order → old order unchanged
- Product discount changes after order → old order unchanged
- Product scheme changes after order → old order unchanged

### Reports
- Draft excluded
- Cancelled excluded
- Bonus quantity has zero sales value
- Product-wise sales
- Customer-wise sales
- Booker-wise sales
- Monthly sales
- Date-range sales

### Targets
- Correct achievement
- Correct remaining
- Correct percentage
- Zero-target handling

---

# 38. File/Project Documentation

The project should contain clear documentation.

Recommended:

```text
README.md
PROJECT_SPEC.md
.env.example
```

`PROJECT_SPEC.md` should contain this master specification or the latest approved version.

Claude and other developers should consult `PROJECT_SPEC.md` before implementing or changing features.

---

# 39. Development Rules for Claude / AI Agents

This section is especially important.

When working on this project:

1. Read `PROJECT_SPEC.md` before making significant changes.
2. Treat this file as the source of truth.
3. Do not invent business requirements.
4. Do not add excluded features.
5. Do not create a separate admin/management panel.
6. Do not add stock/inventory.
7. Do not add Areas/Territories.
8. Do not add Booker Targets or Area Targets.
9. Do not add external integrations.
10. Do not change approved business rules without explicit instruction.
11. Do not allow submitted orders to be edited.
12. Do not modify historical order prices.
13. Do not modify historical order discounts.
14. Do not modify historical order schemes.
15. Do not count cancelled orders as sales.
16. Do not count drafts as sales.
17. Preserve backward compatibility when changing code.
18. Prefer small, focused changes.
19. Run relevant tests after changes.
20. Do not rewrite working architecture unnecessarily.
21. If a requirement is ambiguous, inspect this file and existing code first.
22. If it is still ambiguous, ask for clarification rather than inventing behavior.
23. Before completing a task, verify that existing functionality still works.
24. Keep documentation updated when approved requirements change.

---

# 40. Development Stages

The application should be built incrementally.

## Stage 1 — Project Foundation
- Project initialization
- Frontend architecture
- Backend architecture
- Database foundation
- Environment configuration
- Routing/API foundation
- Developer documentation
- Health checks
- Basic tests

## Stage 2 — Authentication & Booker System
- Login
- Logout
- Booker/user management
- Password security
- User profile
- Active/inactive status

No RBAC.

## Stage 3 — Customers
- Customer CRUD
- Search
- Filters
- Details
- Order history
- Re-order

## Stage 4 — Products & Pricing
- Product CRUD
- Search
- Product details
- Prices
- Discounts
- Product-wise bonus schemes
- Automatic bonus calculation engine

## Stage 5 — Order Booking Engine
- Create order
- Product selection
- Quantity
- Price snapshot
- Discount
- Bonus calculation
- Order totals
- Remarks
- Submit order
- Automatic order number

## Stage 6 — Draft Orders
- Create draft
- Edit draft
- Continue draft
- Delete draft
- Submit draft

## Stage 7 — Orders
- Order list
- Filters
- Details
- Status
- Cancellation
- Historical locking

## Stage 8 — Sales Reports
- Daily
- Monthly
- Customer-wise
- Product-wise
- Booker-wise
- Date-range

## Stage 9 — Targets
- Monthly targets
- Achieved
- Remaining
- Achievement percentage

## Stage 10 — Dashboard, UI Polish & QA
- Dashboard
- UX improvements
- Responsive behavior
- Loading/error/empty states
- Performance
- Security review
- Full testing
- Bug fixing
- Final documentation

---

# 41. Stage Execution Rule

Do not implement all stages at once.

Complete one stage at a time.

Within each stage:

1. Understand requirements.
2. Inspect existing project.
3. Plan changes.
4. Implement only the requested stage/step.
5. Run tests.
6. Fix issues.
7. Verify existing functionality.
8. Update documentation if necessary.
9. Stop before moving to the next stage unless explicitly instructed.

---

# 42. Change Management

If a new requirement is approved:

1. Update this specification.
2. Identify affected modules.
3. Identify database/API/UI impact.
4. Implement the change carefully.
5. Update tests.
6. Verify historical data/business rules are not unintentionally affected.

Never silently change a business rule.

---

# 43. Non-Goals / Do Not Build

Unless explicitly requested later, do not build:

- Inventory
- Stock
- Purchase management
- Suppliers
- Warehouses
- Deliveries
- Invoices
- Accounting
- Payments
- Expenses
- Returns
- Batch tracking
- Expiry management
- External ERP integration
- Shopify integration
- Odoo integration
- Area/Territory management
- Booker-specific targets
- Area-specific targets
- Complex permissions/RBAC
- Separate admin panel
- Separate management panel

These are outside the current product scope.

---

# 44. Current Approved Business Rules — Quick Reference

```text
Application:
Standalone + Open Source

External Integration:
None

App Structure:
One unified application

Separate Admin Panel:
No

Separate Management Panel:
No

RBAC:
No

Stock:
No

Areas/Territories:
No

Booker Targets:
No

Area Targets:
No

Customers:
Yes

Products:
Yes

Prices:
Yes

Discount:
Product-wise

Bonus Scheme:
Product-wise

Bonus Format:
20 + 2 / 20 + 1 / 30 + 1 etc.

Bonus:
Automatically calculated

Submitted Order Editing:
No

Order Cancellation:
Yes

Multiple Same-Day Orders:
Yes

Order Number:
ORD-YYYYMMDD-XXX

Price:
Current price copied when product is added

Historical Price:
Locked

Historical Discount:
Locked

Historical Scheme:
Locked

Draft Orders:
Yes

Sales Reports:
Yes

Targets:
Monthly only

Cancelled Orders in Sales:
No

Draft Orders in Sales:
No

Bonus Sales Value:
Zero
```

---

# 45. Future Expansion Principle

The current application should be architected cleanly enough that future modules can be added without breaking the existing system.

However, do not build future functionality in advance.

Possible future features may include:

- Delivery management
- Returns
- Invoices
- Payments
- Inventory
- Advanced reporting
- Notifications
- Offline mode
- Multi-business support

These are future possibilities only and are NOT part of the current implementation.

---

# 46. Final Source-of-Truth Statement

This document is the authoritative specification for the Medicine Order Booking App.

If existing code conflicts with this document, do not blindly overwrite the code. First determine whether the code reflects a newer explicitly approved requirement.

If no newer approved requirement exists, this specification takes priority.

The application must remain:

**Simple + Standalone + Open Source + Reliable + Easy to Use + Easy to Maintain.**

Do not add complexity without a business requirement.
