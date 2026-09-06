Update the Bulk Product Import logic to support "Upsert" (Update existing products and insert new ones):

1. Matching & Update Logic (Backend):
   - When processing Excel/CSV rows in POST /api/products/validate-bulk and POST /api/products/bulk-upload:
     * Match existing products using Product Code (if provided) OR exact Product Name (case-insensitive).
     * If a match is found: Update the existing product's fields (especially Company/Manufacturer, MRP, Sale Price, Discount, Schemes) instead of creating a duplicate row.
     * If no match is found: Create/Insert as a new product (auto-generating Product Code if missing).

2. Validation & Summary Enhancements:
   - Update the "Test / Validate File" summary response to show a breakdown:
     * Total Rows Processed
     * New Products to be Inserted
     * Existing Products to be Updated
   - Ensure the validation step verifies that rows matching existing products won't violate database constraints.

3. Frontend Modal Update:
   - In ProductList.jsx import modal, display the updated test summary showing how many new products will be added and how many existing products will have their details (like Company Name) updated.