import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import { ORDER_NUMBER_EXHAUSTED } from '../utils/orderNumber.js';
import {
  cancelOrder,
  createOrderWithItems,
  deleteDraftOrder,
  findOrderDetailsById,
  listOrders,
  submitOrder,
  toPublicOrder,
  updateDraftOrder,
} from '../models/order.js';
import { toPublicOrderItem } from '../models/orderItem.js';

const router = Router();

// Every order endpoint requires a logged-in booker — the authenticated user
// is also who the order is recorded against (PROJECT_SPEC.md §2).
router.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ORDER_STATUSES = ['draft', 'submitted', 'cancelled'];
// Only these two can be created; an order can never be born cancelled
// (PROJECT_SPEC.md §12 — cancellation is a transition on a submitted order).
const CREATABLE_STATUSES = ['draft', 'submitted'];

const REMARKS_MAX = 1000;
// Sanity bounds, not business rules: they keep a malformed or hostile
// request from turning into a pathological query or an arithmetic overflow
// in the money columns. Both are far above any real order.
const MAX_ITEMS = 200;
const MAX_QUANTITY = 1000000;

function requireValidId(id) {
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'Invalid order id.');
  }
}

// Accepts a YYYY-MM-DD calendar date and rejects impossible ones
// (2026-02-31), which would otherwise reach PostgreSQL as a cast error.
function isValidDateString(value) {
  if (!DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Validates and normalizes an order payload — used by both create and
// draft edit, which carry exactly the same contents.
//
// `allowStatus` is false when editing: a draft edit replaces the order's
// contents, never its status. Submitting is its own endpoint, so an edit
// can't quietly finalize an order the booker only meant to save.
//
// Note what is NOT accepted here at all: rate, MRP, bonus quantity, line
// totals, order totals, or an order number. Every one of those is derived
// server-side from the product's current values at save time
// (PROJECT_SPEC.md §6, §9, §11), so a client cannot set its own price or
// award itself a bonus. Anything of the sort in the body is ignored.
//
// The one commercial value a client MAY set is a line's `discount`, because
// discounting a particular sale is a decision the booker makes. It is
// optional — omit it and the product's own discount applies — and validated
// like any other input. Whatever is used is snapshotted onto the order item
// (§7, §16), so reports and history stay honest either way.
function validateOrderPayload(body, { allowStatus }) {
  const errors = [];
  const data = {};

  if (typeof body.customerId !== 'string' || !UUID_RE.test(body.customerId)) {
    errors.push('customerId is required and must be a valid id.');
  } else {
    data.customerId = body.customerId;
  }

  // Defaults to a finished order; saving a draft is the explicit opt-in
  // (PROJECT_SPEC.md §10, step 11: "Save as Draft OR Submit Order").
  if (!allowStatus) {
    // An edit always leaves the order a draft.
    data.status = 'draft';
    if (body.status !== undefined && body.status !== 'draft') {
      errors.push('An order\'s status cannot be changed by editing it — submit the draft instead.');
    }
  } else if (body.status === undefined) {
    data.status = 'submitted';
  } else if (typeof body.status !== 'string' || !CREATABLE_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${CREATABLE_STATUSES.join(', ')}.`);
  } else {
    data.status = body.status;
  }

  if (body.remarks === undefined || body.remarks === null) {
    data.remarks = null;
  } else if (typeof body.remarks !== 'string') {
    errors.push('remarks must be a string.');
  } else if (body.remarks.trim().length > REMARKS_MAX) {
    errors.push(`remarks must be at most ${REMARKS_MAX} characters.`);
  } else {
    data.remarks = body.remarks.trim() || null;
  }

  const items = body.items === undefined ? [] : body.items;

  if (!Array.isArray(items)) {
    errors.push('items must be an array.');
    return { data, errors };
  }

  // A draft is explicitly allowed to be empty — it's an order still being
  // built. A submitted order is not (PROJECT_SPEC.md §26).
  if (items.length === 0 && data.status === 'submitted') {
    errors.push('At least one item is required to submit an order.');
  }

  if (items.length > MAX_ITEMS) {
    errors.push(`An order cannot have more than ${MAX_ITEMS} items.`);
    return { data, errors };
  }

  const seenProductIds = new Set();
  data.items = [];

  items.forEach((item, index) => {
    const label = `items[${index}]`;

    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label} must be an object.`);
      return;
    }

    if (typeof item.productId !== 'string' || !UUID_RE.test(item.productId)) {
      errors.push(`${label}.productId is required and must be a valid id.`);
    } else if (seenProductIds.has(item.productId)) {
      // Each product appears once per order; the quantity is what changes.
      // Merging silently would hide a client bug and make the order the
      // user reviewed differ from the one that was saved.
      errors.push(`${label}.productId is a duplicate — list each product once and set its total quantity.`);
    } else {
      seenProductIds.add(item.productId);
    }

    // The quantity the booker enters is the PAID quantity. Any bonus is
    // added on top of it automatically and is never requested by a client.
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
      errors.push(`${label}.quantity is required and must be a whole number.`);
      return;
    }
    if (quantity <= 0) {
      errors.push(`${label}.quantity must be greater than 0.`);
      return;
    }
    if (quantity > MAX_QUANTITY) {
      errors.push(`${label}.quantity must be at most ${MAX_QUANTITY}.`);
      return;
    }

    // Optional per-line discount override. Absent means "use the product's
    // own discount", which is what almost every line does.
    let discount;
    if (item.discount !== undefined && item.discount !== null) {
      // Number(null) === 0, hence the explicit guard above: an explicit
      // null must not quietly become a 0% discount.
      const value = typeof item.discount === 'number' ? item.discount : Number(item.discount);
      if (!Number.isFinite(value)) {
        errors.push(`${label}.discount must be a number between 0 and 100.`);
        return;
      }
      if (value < 0 || value > 100) {
        errors.push(`${label}.discount must be between 0 and 100.`);
        return;
      }
      // Stored to 2 decimals; round rather than let the column truncate.
      discount = Math.round(value * 100) / 100;
    }

    if (typeof item.productId === 'string') {
      data.items.push({ productId: item.productId, quantity, discount });
    }
  });

  return { data, errors };
}

function toOrderDetailsResponse({ order, items }) {
  return {
    ...toPublicOrder(order),
    items: items.map(toPublicOrderItem),
  };
}

// Create an order — submitted, or saved as a draft with `status: "draft"`.
//
// Body: { customerId, status?, remarks?, items: [{ productId, quantity }] }
//
// The order, its line-item snapshots, its totals and (when submitted) its
// order number are all written in a single transaction: the whole order is
// saved or none of it is (PROJECT_SPEC.md §30).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { data, errors } = validateOrderPayload(req.body ?? {}, { allowStatus: true });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    let order;
    try {
      order = await createOrderWithItems({
        customerId: data.customerId,
        // The order is always recorded against the authenticated booker —
        // never a booker id supplied by the client (PROJECT_SPEC.md §33).
        bookerId: req.user.id,
        status: data.status,
        remarks: data.remarks,
        items: data.items,
      });
    } catch (err) {
      // 999 orders already exist for today, so no valid ORD-YYYYMMDD-XXX
      // number is left to issue. Nothing was saved (the transaction rolled
      // back) and the situation resolves itself at midnight, so this is a
      // temporary condition rather than a bad request.
      if (err.code === ORDER_NUMBER_EXHAUSTED) {
        throw new ApiError(503, 'The daily order number limit has been reached. Please try again tomorrow.');
      }
      throw err;
    }

    // Re-read so a created order comes back in exactly the same shape as
    // GET /api/orders/:id, customer/booker details and all.
    const details = await findOrderDetailsById(order.id);
    res.status(201).json({ order: toOrderDetailsResponse(details) });
  })
);

// List orders, newest first, with the filters the Orders module needs
// (PROJECT_SPEC.md §17). All filters combine.
//
// Query: page, limit, search (order number / customer name / customer code),
// status, customerId, bookerId, dateFrom, dateTo (inclusive, YYYY-MM-DD).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const { status, customerId, bookerId, dateFrom, dateTo } = req.query;

    // Accepts one status or a comma-separated list, so the Orders module
    // can ask for submitted and cancelled orders together while Draft
    // Orders asks for drafts alone.
    let statuses;
    if (status !== undefined) {
      if (typeof status !== 'string') {
        throw new ApiError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}.`);
      }
      statuses = status
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (statuses.length === 0 || statuses.some((value) => !ORDER_STATUSES.includes(value))) {
        throw new ApiError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}.`);
      }
    }

    if (customerId !== undefined && !UUID_RE.test(customerId)) {
      throw new ApiError(400, 'customerId must be a valid id.');
    }

    if (bookerId !== undefined && !UUID_RE.test(bookerId)) {
      throw new ApiError(400, 'bookerId must be a valid id.');
    }

    for (const [field, value] of [
      ['dateFrom', dateFrom],
      ['dateTo', dateTo],
    ]) {
      if (value !== undefined && !isValidDateString(value)) {
        throw new ApiError(400, `${field} must be a valid date in YYYY-MM-DD format.`);
      }
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const { rows, total } = await listOrders({
      search: search || undefined,
      statuses,
      customerId,
      bookerId,
      dateFrom,
      dateTo,
      page,
      limit,
    });

    res.json({
      orders: rows.map(toPublicOrder),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  })
);

// Replace a draft's contents — customer, remarks and lines
// (PROJECT_SPEC.md §13: Edit Draft / Continue Order). The body is the same
// shape as POST, minus `status`.
//
// Submitted orders are not editable (PROJECT_SPEC.md §14): this returns 409
// for anything that isn't currently a draft. The lines are re-priced from
// the products' current values, so a draft picked up days later goes out at
// today's prices.
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const { data, errors } = validateOrderPayload(req.body ?? {}, { allowStatus: false });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    await updateDraftOrder({
      orderId: req.params.id,
      customerId: data.customerId,
      remarks: data.remarks,
      items: data.items,
    });

    const details = await findOrderDetailsById(req.params.id);
    res.json({ order: toOrderDetailsResponse(details) });
  })
);

// Submit a draft (PROJECT_SPEC.md §13). This is where a draft stops being a
// work in progress: it gets its final ORD-YYYYMMDD-XXX number and becomes
// immutable. The number is reserved in the same transaction as the status
// change, and the draft row is locked for the duration, so a double-click
// can only ever produce one order number.
//
// The draft must have at least one product (PROJECT_SPEC.md §26).
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    try {
      await submitOrder(req.params.id);
    } catch (err) {
      if (err.code === ORDER_NUMBER_EXHAUSTED) {
        throw new ApiError(503, 'The daily order number limit has been reached. Please try again tomorrow.');
      }
      throw err;
    }

    const details = await findOrderDetailsById(req.params.id);
    res.json({ order: toOrderDetailsResponse(details) });
  })
);

// Delete a draft (PROJECT_SPEC.md §13). Unlike customers and products —
// which are soft-deleted because orders reference them — a draft is removed
// outright, along with its items: it was never a real order, holds no order
// number, and nothing in the system points at it.
//
// Submitted and cancelled orders are kept permanently (PROJECT_SPEC.md
// §12), so this returns 409 for anything that isn't a draft.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const deleted = await deleteDraftOrder(req.params.id);
    res.json({ order: toPublicOrder(deleted) });
  })
);

// Cancel a submitted order (PROJECT_SPEC.md §15). The order is kept in full
// — every line, its totals and its order number stay exactly as they were —
// and is simply marked cancelled, stamped with the time and the booker who
// did it (§33). From here it is excluded from every sales figure (§12).
//
// This is the ONLY thing that can be done to a submitted order. There is no
// route anywhere that edits one (§14, §16): a mistake is corrected by
// cancelling and creating a new order.
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    // Recorded against the authenticated booker, never one named by the
    // client.
    await cancelOrder(req.params.id, req.user.id);

    const details = await findOrderDetailsById(req.params.id);
    res.json({ order: toOrderDetailsResponse(details) });
  })
);

// Full order details, including every line item with its historical
// snapshot (PROJECT_SPEC.md §17).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const details = await findOrderDetailsById(req.params.id);
    if (!details) {
      throw new ApiError(404, 'Order not found.');
    }

    res.json({ order: toOrderDetailsResponse(details) });
  })
);

export default router;
