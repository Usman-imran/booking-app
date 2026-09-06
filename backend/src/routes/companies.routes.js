import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import authenticate from '../middleware/authenticate.js';
import { listCompaniesWithCounts } from '../models/product.js';

const router = Router();

router.use(authenticate);

// The manufacturers products are assigned to, with how many active products
// each one has — what the Companies section browses.
//
// There is no companies table and there should not be one: Company is a
// field on the product (PROJECT_SPEC.md §5), and §21/§27 warn against
// inventing entities. This list is derived from the products, so it stays
// correct on its own as products are added, edited, imported or
// deactivated — there is nothing to keep in step.
//
// Deliberately not paginated: the list is bounded by how many manufacturers
// a distributor deals with, which is dozens, not thousands. Searching it is
// the client's job for the same reason (PROJECT_SPEC.md §35 asks for
// server-side search on LARGE datasets).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companies = await listCompaniesWithCounts();
    res.json({
      companies,
      total: companies.length,
      totalProducts: companies.reduce((sum, row) => sum + row.productCount, 0),
    });
  })
);

export default router;
