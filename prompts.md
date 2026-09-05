Read `PROJECT_SPEC.md` and continue from the completed Stages 1–4.

Implement **Stage 5 — Step 1: Order Database & Historical Snapshots** only.

Build the database foundation for:

* Orders
* Order Items

Requirements:

* Order belongs to a Customer.
* Order is created by the logged-in Booker/User.
* Order status: Draft, Submitted, Cancelled.
* Support multiple orders for the same customer on the same day.
* Use UUID primary keys and proper foreign keys/indexes.
* Store order date/time, remarks, totals and timestamps.
* Order Item must preserve historical commercial values at order time:

  * Product ID
  * Product name/code where useful
  * MRP
  * Sale Price/Rate
  * Discount
  * Paid Quantity
  * Bonus Quantity
  * Scheme Purchase Qty
  * Scheme Bonus Qty
  * Line subtotal
  * Line discount
  * Line total
* Historical values must remain unchanged if the Product's price, discount or scheme changes later.
* Bonus quantity has zero sales value.
* Drafts are editable and do not count as sales.
* Submitted orders cannot be edited.
* Cancelled orders remain stored and never count as sales.
* Do NOT build Order UI yet.
* Do NOT build Sales Reports, Targets, Stock, Areas or other modules.

Create the migration(s), models and database constraints needed for this step.

Test:

* Foreign keys
* Required fields
* Status constraints
* Quantity/amount validation
* Historical snapshot fields
* Draft/Submitted/Cancelled data integrity
* Migration up/down

Give me a short report.

**STOP after Stage 5 Step 1.**
