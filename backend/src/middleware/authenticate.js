import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { verifyAuthToken } from '../utils/jwt.js';
import { findUserById } from '../models/user.js';

// Verifies the Bearer token and re-checks the user's current active status
// on every request, so a deactivated user loses access immediately rather
// than staying valid until the token expires.
const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Authentication required.');
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  let user;
  try {
    user = await findUserById(payload.sub);
  } catch {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  if (!user || !user.is_active) {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  req.user = user;
  next();
});

export default authenticate;
