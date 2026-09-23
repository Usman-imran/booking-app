import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  createCustomer,
  deactivateCustomer,
  findCustomerByCode,
  findCustomerById,
  listCustomerAreas,
  listCustomers,
  toPublicCustomer,
  updateCustomer,
} from '../models/customer.js';

const router = Router();

// Every customer endpoint requires a logged-in user, and every query below
// is scoped to that user's own customers (req.user.id is the owner).
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LIMITS = {
  name: 150,
  code: 50,
  contactPerson: 150,
  phone: 20,
  alternatePhone: 20,
  cityArea: 100,
  customerType: 50,
};

function requireValidId(id) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'Invalid customer id.');
  }
}

// Validates and normalizes a create/update payload. In partial mode
// (updates), a field missing from the body is simply left untouched;
// a field that IS present is still validated the same way either way.
function validateCustomerPayload(body, { partial }) {
  const errors = [];
  const data = {};

  function readString(field, { required = false } = {}) {
    const value = body[field];

    if (value === undefined) {
      if (required && !partial) errors.push(`${field} is required.`);
      return;
    }

    if (value !== null && typeof value !== 'string') {
      errors.push(`${field} must be a string.`);
      return;
    }

    const trimmed = value === null ? '' : value.trim();

    if (required && !trimmed) {
      errors.push(`${field} is required.`);
      return;
    }

    const limit = FIELD_LIMITS[field];
    if (limit && trimmed.length > limit) {
      errors.push(`${field} must be at most ${limit} characters.`);
      return;
    }

    data[field] = trimmed || null;
  }

  readString('name', { required: true });
  readString('code', { required: true });
  readString('contactPerson');
  readString('phone');
  readString('alternatePhone');
  readString('cityArea');
  readString('customerType');

  if (body.address !== undefined) {
    if (body.address !== null && typeof body.address !== 'string') {
      errors.push('address must be a string.');
    } else {
      data.address = body.address ? body.address.trim() || null : null;
    }
  }

  if (partial && body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      errors.push('isActive must be a boolean.');
    } else {
      data.isActive = body.isActive;
    }
  }

  return { data, errors };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { data, errors } = validateCustomerPayload(req.body ?? {}, { partial: false });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (await findCustomerByCode(req.user.id, data.code)) {
      throw new ApiError(409, 'Customer code already exists.');
    }

    let customer;
    try {
      customer = await createCustomer(req.user.id, data);
    } catch (err) {
      if (err.code === '23505') {
        throw new ApiError(409, 'Customer code already exists.');
      }
      throw err;
    }

    res.status(201).json({ customer: toPublicCustomer(customer) });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    let isActive;
    if (req.query.isActive === 'true') {
      isActive = true;
    } else if (req.query.isActive === 'false') {
      isActive = false;
    } else if (req.query.isActive !== undefined) {
      throw new ApiError(400, 'isActive must be "true" or "false".');
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const cityArea = typeof req.query.cityArea === 'string' ? req.query.cityArea.trim() : '';

    const { rows, total } = await listCustomers(req.user.id, {
      search: search || undefined,
      isActive,
      cityArea: cityArea || undefined,
      page,
      limit,
    });

    res.json({
      customers: rows.map(toPublicCustomer),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  })
);

// GET /api/customers/areas - the city/areas in use, for the area filter:
// { areas: [{ area, customers }] }. Registered before /:id so "areas"
// isn't read as a customer id.
router.get(
  '/areas',
  asyncHandler(async (req, res) => {
    res.json({ areas: await listCustomerAreas(req.user.id) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const customer = await findCustomerById(req.user.id, req.params.id);
    if (!customer) {
      throw new ApiError(404, 'Customer not found.');
    }

    res.json({ customer: toPublicCustomer(customer) });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const existing = await findCustomerById(req.user.id, req.params.id);
    if (!existing) {
      throw new ApiError(404, 'Customer not found.');
    }

    const { data, errors } = validateCustomerPayload(req.body ?? {}, { partial: true });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'At least one field must be provided.');
    }

    if (data.code && data.code !== existing.code) {
      const codeOwner = await findCustomerByCode(req.user.id, data.code);
      if (codeOwner && codeOwner.id !== existing.id) {
        throw new ApiError(409, 'Customer code already exists.');
      }
    }

    let updated;
    try {
      updated = await updateCustomer(req.user.id, req.params.id, data);
    } catch (err) {
      if (err.code === '23505') {
        throw new ApiError(409, 'Customer code already exists.');
      }
      throw err;
    }

    res.json({ customer: toPublicCustomer(updated) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const updated = await deactivateCustomer(req.user.id, req.params.id);
    if (!updated) {
      throw new ApiError(404, 'Customer not found.');
    }

    res.json({ customer: toPublicCustomer(updated) });
  })
);

export default router;
