import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import { createUser, findUserByUsername, setCompanyName, toPublicUser } from '../models/user.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAuthToken } from '../utils/jwt.js';

const router = Router();

const FIELD_LIMITS = { name: 150, username: 50, companyName: 150, phone: 20 };
const MIN_PASSWORD_LENGTH = 8;

function readRequiredString(body, field, errors) {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${field} is required.`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > FIELD_LIMITS[field]) {
    errors.push(`${field} must be at most ${FIELD_LIMITS[field]} characters.`);
    return null;
  }
  return trimmed;
}

// Registration is open: anyone who reaches the app can create an account
// and is signed straight in. Each account is its own isolated workspace —
// its customers, products, orders and targets are visible to it alone.
//
// POST /api/auth/register
// Body: { name, username, password, companyName, phone? }
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const errors = [];

    const name = readRequiredString(body, 'name', errors);
    const username = readRequiredString(body, 'username', errors);
    // Required, per the branding it drives: an account with no company name
    // would print a generic receipt.
    const companyName = readRequiredString(body, 'companyName', errors);

    const password = body.password;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`password is required and must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    let phone = null;
    if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
      if (typeof body.phone !== 'string' || body.phone.trim().length > FIELD_LIMITS.phone) {
        errors.push(`phone must be a string of at most ${FIELD_LIMITS.phone} characters.`);
      } else {
        phone = body.phone.trim();
      }
    }

    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (await findUserByUsername(username)) {
      throw new ApiError(409, 'That username is already taken.');
    }

    let user;
    try {
      user = await createUser({
        name,
        username,
        passwordHash: await hashPassword(password),
        phone,
        companyName,
      });
    } catch (err) {
      // Lost a race with a concurrent registration for the same username.
      if (err.code === '23505') {
        throw new ApiError(409, 'That username is already taken.');
      }
      throw err;
    }

    // Signed straight in, so signing up doesn't need a second step.
    const token = signAuthToken({ sub: user.id, companyName: user.company_name });

    res.status(201).json({ token, user: toPublicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      throw new ApiError(400, 'Username and password are required.');
    }

    const user = await findUserByUsername(username.trim());

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiError(401, 'Invalid username or password.');
    }

    if (!user.is_active) {
      throw new ApiError(403, 'This account is inactive.');
    }

    // `sub` is what the middleware actually trusts — it re-reads the user
    // on every request, so the company name here is a convenience for
    // anything inspecting the token, never the source of truth.
    const token = signAuthToken({ sub: user.id, companyName: user.company_name });

    res.json({ token, user: toPublicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// PUT /api/auth/company — rename the business.
//
// An application-level setting (PROJECT_SPEC.md §24), not a business record:
// it changes what the app calls itself in the sidebar and at the top of
// every order receipt. Nothing about customers, products or orders moves.
//
// It applies to the signed-in account only — each account is its own
// workspace, so nobody's rename can touch anyone else's branding.
//
// Historical receipts are NOT rewritten: a receipt is generated from the
// current name each time it is exported, so re-exporting an old order shows
// the new name. The order's own commercial values are untouched (§16).
router.put(
  '/company',
  authenticate,
  asyncHandler(async (req, res) => {
    const raw = req.body?.companyName;

    if (typeof raw !== 'string' || !raw.trim()) {
      throw new ApiError(400, 'companyName is required.');
    }

    const companyName = raw.trim();
    if (companyName.length > FIELD_LIMITS.companyName) {
      throw new ApiError(400, `companyName must be at most ${FIELD_LIMITS.companyName} characters.`);
    }

    // RETURNING gives back what is actually stored, rather than patching
    // the cached request user.
    const user = await setCompanyName(req.user.id, companyName);
    res.json({ user: toPublicUser(user) });
  })
);

export default router;
