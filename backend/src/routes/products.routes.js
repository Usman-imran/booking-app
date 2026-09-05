import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  createProduct,
  deactivateProduct,
  findProductByCode,
  findProductById,
  listProducts,
  toPublicProduct,
  updateProduct,
} from '../models/product.js';

const router = Router();

// Every product endpoint requires a logged-in booker.
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LIMITS = {
  name: 200,
  code: 50,
  company: 150,
  packing: 100,
  unit: 50,
};

function requireValidId(id) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'Invalid product id.');
  }
}

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

// Validates and normalizes a create/update payload. In partial mode
// (updates), a field missing from the body is left untouched — except the
// bonus-scheme fields, which are always re-derived together (see below) so
// the row can never end up in an inconsistent scheme state.
function validateProductPayload(body, { partial, existing }) {
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
  readString('company');
  readString('packing');
  readString('unit');

  function readNonNegativeNumber(field, { required = false } = {}) {
    const value = body[field];

    if (value === undefined) {
      if (required && !partial) errors.push(`${field} is required.`);
      return;
    }

    // Number(null) === 0, so without this check an explicit `null` would
    // silently become a valid non-negative number instead of an error.
    if (value === null) {
      errors.push(`${field} must be a number.`);
      return;
    }

    const num = toFiniteNumber(value);
    if (num === null) {
      errors.push(`${field} must be a number.`);
      return;
    }
    if (num < 0) {
      errors.push(`${field} must not be negative.`);
      return;
    }
    data[field] = num;
  }

  readNonNegativeNumber('mrp', { required: true });
  readNonNegativeNumber('salePrice', { required: true });

  if (body.discount !== undefined) {
    // Number(null) === 0, so guard explicitly rather than let a null
    // discount silently pass as 0.
    const num = body.discount === null ? null : toFiniteNumber(body.discount);
    if (num === null || num < 0 || num > 100) {
      errors.push('discount must be a number between 0 and 100.');
    } else {
      data.discount = num;
    }
  } else if (!partial) {
    data.discount = 0;
  }

  // --- Bonus scheme (PROJECT_SPEC.md §8/§9) ---
  // The scheme is only valid as a whole (enabled + both quantities, or
  // disabled) — never touch just one of the three fields. On a partial
  // update, if none of them are present in the body, leave the existing
  // scheme completely alone (don't even include it in `data`), so an
  // unrelated field update can't clobber a concurrent scheme change.
  function readOptionalInteger(field) {
    const value = body[field];
    if (value === undefined) {
      return { present: false, value: null };
    }
    if (value === null) {
      return { present: true, value: null };
    }
    const num = Number(value);
    if (!Number.isInteger(num)) {
      errors.push(`${field} must be an integer.`);
      return { present: true, value: null };
    }
    return { present: true, value: num };
  }

  const schemeEnabledProvided = body.schemeEnabled !== undefined;
  const purchaseQtyInput = readOptionalInteger('schemePurchaseQty');
  const bonusQtyInput = readOptionalInteger('schemeBonusQty');
  const schemeTouched = schemeEnabledProvided || purchaseQtyInput.present || bonusQtyInput.present;

  if (!partial || schemeTouched) {
    let schemeEnabled;
    if (schemeEnabledProvided) {
      if (typeof body.schemeEnabled !== 'boolean') {
        errors.push('schemeEnabled must be a boolean.');
      } else {
        schemeEnabled = body.schemeEnabled;
      }
    } else {
      // Create defaults to false; a partial update that only touches the
      // quantities keeps whatever the row's current enabled flag is.
      schemeEnabled = partial ? Boolean(existing?.scheme_enabled) : false;
    }

    const effectivePurchaseQty = purchaseQtyInput.present
      ? purchaseQtyInput.value
      : partial
        ? (existing?.scheme_purchase_qty ?? null)
        : null;
    const effectiveBonusQty = bonusQtyInput.present
      ? bonusQtyInput.value
      : partial
        ? (existing?.scheme_bonus_qty ?? null)
        : null;

    if (schemeEnabled === true) {
      if (!(Number.isInteger(effectivePurchaseQty) && effectivePurchaseQty > 0)) {
        errors.push('schemePurchaseQty must be a positive integer when the scheme is enabled.');
      }
      if (!(Number.isInteger(effectiveBonusQty) && effectiveBonusQty >= 0)) {
        errors.push('schemeBonusQty must be zero or a positive integer when the scheme is enabled.');
      }
    }

    if (schemeEnabled !== undefined) {
      data.schemeEnabled = schemeEnabled;
      data.schemePurchaseQty = schemeEnabled ? effectivePurchaseQty : null;
      data.schemeBonusQty = schemeEnabled ? effectiveBonusQty : null;
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
    const { data, errors } = validateProductPayload(req.body ?? {}, { partial: false });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (await findProductByCode(data.code)) {
      throw new ApiError(409, 'Product code already exists.');
    }

    let product;
    try {
      product = await createProduct(data);
    } catch (err) {
      if (err.code === '23505') {
        throw new ApiError(409, 'Product code already exists.');
      }
      throw err;
    }

    res.status(201).json({ product: toPublicProduct(product) });
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

    const { rows, total } = await listProducts({ search: search || undefined, isActive, page, limit });

    res.json({
      products: rows.map(toPublicProduct),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const product = await findProductById(req.params.id);
    if (!product) {
      throw new ApiError(404, 'Product not found.');
    }

    res.json({ product: toPublicProduct(product) });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const existing = await findProductById(req.params.id);
    if (!existing) {
      throw new ApiError(404, 'Product not found.');
    }

    const { data, errors } = validateProductPayload(req.body ?? {}, { partial: true, existing });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'At least one field must be provided.');
    }

    if (data.code && data.code !== existing.code) {
      const codeOwner = await findProductByCode(data.code);
      if (codeOwner && codeOwner.id !== existing.id) {
        throw new ApiError(409, 'Product code already exists.');
      }
    }

    let updated;
    try {
      updated = await updateProduct(req.params.id, data);
    } catch (err) {
      if (err.code === '23505') {
        throw new ApiError(409, 'Product code already exists.');
      }
      throw err;
    }

    res.json({ product: toPublicProduct(updated) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const updated = await deactivateProduct(req.params.id);
    if (!updated) {
      throw new ApiError(404, 'Product not found.');
    }

    res.json({ product: toPublicProduct(updated) });
  })
);

export default router;
