import { Router } from 'express';
import pool from '../config/db.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get(
  '/db',
  asyncHandler(async (req, res) => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      throw new ApiError(503, err.message || err.code || 'Database unavailable');
    }
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  })
);

export default router;
