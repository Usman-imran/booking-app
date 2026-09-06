import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import authenticate from '../middleware/authenticate.js';
import { listUsers, toPublicUser } from '../models/user.js';

const router = Router();

router.use(authenticate);

// Read-only list of bookers, so the Orders module can offer the Booker
// filter it requires (PROJECT_SPEC.md §17) with real names rather than ids.
//
// Deliberately read-only: there is no user management in this application
// and none is planned (PROJECT_SPEC.md §2 — no roles, no permissions).
// Inactive bookers are included, because they still own historical orders
// that have to remain findable.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await listUsers();
    res.json({ users: users.map(toPublicUser) });
  })
);

export default router;
