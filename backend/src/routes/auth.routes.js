import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import { findUserByUsername, toPublicUser } from '../models/user.js';
import { verifyPassword } from '../utils/password.js';
import { signAuthToken } from '../utils/jwt.js';

const router = Router();

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

    const token = signAuthToken({ sub: user.id });

    res.json({ token, user: toPublicUser(user) });
  })
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

export default router;
