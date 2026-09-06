import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  countUsers,
  createUser,
  findUserById,
  findUserByUsername,
  setCompanyNameForAllUsers,
  toPublicUser,
} from '../models/user.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAuthToken, verifyAuthToken } from '../utils/jwt.js';

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

// Registration.
//
// There is no user-management module in this application and none is planned
// (PROJECT_SPEC.md §2: no roles, no permissions), which leaves one problem:
// every authenticated booker can read every customer, order and sales
// figure, so an endpoint that lets anyone create an account would hand the
// whole business's data to whoever finds the URL.
//
// So registration is open only while the system is EMPTY — the first
// account, which sets the company name the app is branded with — and
// requires an existing booker to be signed in after that. That keeps
// self-service first-run setup without leaving the door open behind it.
async function requireRegistrationAllowed(req) {
  if ((await countUsers()) === 0) return;

  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(
      401,
      'Sign in first — once the first account exists, only a signed-in booker can add another.'
    );
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await findUserById(payload.sub);
    if (!user || !user.is_active) throw new Error('inactive');
  } catch {
    throw new ApiError(401, 'Invalid or expired token.');
  }
}

// GET /api/auth/registration-status
//
// Whether an account can be created right now without signing in — i.e.
// whether this is a fresh installation. Public, so the sign-in page can
// offer a "create the first account" link only when it would actually
// work, instead of dangling one that 401s.
//
// It reveals only whether the system has any users at all, which the login
// page already implies.
router.get(
  '/registration-status',
  asyncHandler(async (req, res) => {
    res.json({ open: (await countUsers()) === 0 });
  })
);

// POST /api/auth/register
// Body: { name, username, password, companyName, phone? }
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    await requireRegistrationAllowed(req);

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

    // Signed straight in, so first-run setup doesn't need a second step.
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
// It applies to every account, because there is one business per
// installation (§1) — see setCompanyNameForAllUsers. Any signed-in booker
// may change it; this application has no roles and inventing an admin
// concept for one field would contradict §2.
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

    const updated = await setCompanyNameForAllUsers(companyName);

    // Re-read rather than patching the cached request user, so the response
    // reflects what is actually stored.
    const user = await findUserById(req.user.id);
    res.json({ user: toPublicUser(user), accountsUpdated: updated });
  })
);

export default router;
