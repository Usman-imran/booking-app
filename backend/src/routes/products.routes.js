import { Router } from 'express';
import multer from 'multer';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import authenticate from '../middleware/authenticate.js';
import {
  bulkUpsertProducts,
  createProduct,
  deactivateProduct,
  findProductByCode,
  findProductById,
  findProductsByCodes,
  findProductsByNames,
  listProductCompanies,
  listProducts,
  toPublicProduct,
  updateProduct,
} from '../models/product.js';
import {
  buildSampleTemplate,
  MAX_IMPORT_ROWS,
  parseProductWorkbook,
  validateImportRows,
} from '../utils/productImport.js';
import { isValidTier } from '../utils/bonusSchemes.js';

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

// More tiers than this is a data-entry mistake, not a scheme.
const MAX_BONUS_SCHEMES = 10;

// Uploads are held in memory and parsed straight from the buffer: an
// import is a few hundred kilobytes at most and is consumed immediately, so
// writing it to disk would only add a file to clean up.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

// This limit is about the transfer; the cap on how many ROWS a sheet may
// contain lives with the parser (MAX_IMPORT_ROWS).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      // Rejected by name rather than by MIME type: browsers and operating
      // systems disagree wildly about what to call a .xlsx, and the parser
      // sniffs the actual format anyway.
      cb(new ApiError(400, `Upload a ${ACCEPTED_EXTENSIONS.join(', ')} file.`));
      return;
    }
    cb(null, true);
  },
}).single('file');

// multer reports its own failures through the callback rather than by
// throwing, so it is wrapped to turn them into the same ApiError shape
// every other route produces.
function receiveUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (!err) {
        resolve();
        return;
      }
      if (err instanceof ApiError) {
        reject(err);
      } else if (err.code === 'LIMIT_FILE_SIZE') {
        reject(new ApiError(400, `The file is too large — the limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`));
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        reject(new ApiError(400, 'Send the spreadsheet as a single file in the "file" field.'));
      } else {
        reject(new ApiError(400, `The upload could not be read: ${err.message}`));
      }
    });
  });
}

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
// (updates), a field missing from the body is left untouched — including
// the bonus schemes, which are only rewritten when the body speaks about
// them (see below), so an unrelated field update can't clobber them.
function validateProductPayload(body, { partial }) {
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

  // --- Bonus schemes (PROJECT_SPEC.md §8/§9) ---
  // `bonusSchemes` is the list of tiers, `[{ purchaseQty, bonusQty }, ...]`,
  // and an empty list means no scheme. The older single-scheme trio
  // (`schemeEnabled` / `schemePurchaseQty` / `schemeBonusQty`) is still
  // accepted as shorthand for a zero- or one-tier list, so an older client
  // keeps working — but when both forms are sent the list wins. On a
  // partial update, a body that mentions none of these leaves the product's
  // schemes completely alone.
  function readBonusSchemes() {
    const list = body.bonusSchemes;
    if (!Array.isArray(list)) {
      errors.push('bonusSchemes must be an array of { purchaseQty, bonusQty }.');
      return undefined;
    }
    if (list.length > MAX_BONUS_SCHEMES) {
      errors.push(`bonusSchemes may hold at most ${MAX_BONUS_SCHEMES} tiers.`);
      return undefined;
    }

    const tiers = [];
    const seen = new Set();
    for (const [index, raw] of list.entries()) {
      const tier =
        raw && typeof raw === 'object'
          ? { purchaseQty: toFiniteNumber(raw.purchaseQty), bonusQty: toFiniteNumber(raw.bonusQty) }
          : null;
      if (!isValidTier(tier)) {
        errors.push(
          `bonusSchemes[${index}] must have a positive whole purchaseQty and a bonusQty of zero or more.`
        );
        return undefined;
      }
      if (seen.has(tier.purchaseQty)) {
        errors.push(`bonusSchemes lists the purchase quantity ${tier.purchaseQty} more than once.`);
        return undefined;
      }
      seen.add(tier.purchaseQty);
      tiers.push(tier);
    }
    return tiers.sort((a, b) => a.purchaseQty - b.purchaseQty);
  }

  function readLegacyScheme() {
    const enabled = body.schemeEnabled;
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      errors.push('schemeEnabled must be a boolean.');
      return undefined;
    }
    // A quantity without an explicit flag means the scheme is on.
    const isOn = enabled === undefined ? true : enabled;
    if (!isOn) return [];

    const purchaseQty = body.schemePurchaseQty === null ? null : toFiniteNumber(body.schemePurchaseQty);
    const bonusQty = body.schemeBonusQty === null ? null : toFiniteNumber(body.schemeBonusQty);
    if (!(Number.isInteger(purchaseQty) && purchaseQty > 0)) {
      errors.push('schemePurchaseQty must be a positive integer when the scheme is enabled.');
      return undefined;
    }
    if (!(Number.isInteger(bonusQty) && bonusQty >= 0)) {
      errors.push('schemeBonusQty must be zero or a positive integer when the scheme is enabled.');
      return undefined;
    }
    return [{ purchaseQty, bonusQty }];
  }

  const legacyTouched =
    body.schemeEnabled !== undefined || body.schemePurchaseQty !== undefined || body.schemeBonusQty !== undefined;

  if (body.bonusSchemes !== undefined) {
    const tiers = readBonusSchemes();
    if (tiers !== undefined) data.bonusSchemes = tiers;
  } else if (legacyTouched) {
    const tiers = readLegacyScheme();
    if (tiers !== undefined) data.bonusSchemes = tiers;
  } else if (!partial) {
    data.bonusSchemes = [];
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

    if (await findProductByCode(req.user.id, data.code)) {
      throw new ApiError(409, 'Product code already exists.');
    }

    let product;
    try {
      product = await createProduct(req.user.id, data);
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

    // Browsing one manufacturer's catalogue (the Companies section).
    let company;
    if (req.query.company !== undefined) {
      if (typeof req.query.company !== 'string' || req.query.company.trim() === '') {
        throw new ApiError(400, 'company must be a non-empty manufacturer name.');
      }
      company = req.query.company.trim();
    }

    // `ids` fetches a known set of products in one go (comma-separated).
    // Capped at the same ceiling as an order's line count, since that is
    // what it exists for — reloading a saved draft's products.
    let ids;
    if (req.query.ids !== undefined) {
      if (typeof req.query.ids !== 'string') {
        throw new ApiError(400, 'ids must be a comma-separated list of product ids.');
      }
      ids = req.query.ids
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (ids.length === 0 || ids.length > 200) {
        throw new ApiError(400, 'ids must list between 1 and 200 product ids.');
      }
      if (ids.some((value) => !UUID_RE.test(value))) {
        throw new ApiError(400, 'ids must contain only valid product ids.');
      }
    }

    // An `ids` lookup asks for a known set, so it returns that whole set
    // rather than being clipped by the normal page size.
    const effectiveLimit = ids ? ids.length : limit;

    const { rows, total } = await listProducts(req.user.id, {
      search: search || undefined,
      isActive,
      ids,
      company,
      page: ids ? 1 : page,
      limit: effectiveLimit,
    });

    res.json({
      products: rows.map(toPublicProduct),
      pagination: {
        page: ids ? 1 : page,
        limit: effectiveLimit,
        total,
        totalPages: Math.max(Math.ceil(total / effectiveLimit), 1),
      },
    });
  })
);

// Downloads the sample import template: the correct columns, two worked
// example rows, and an Instructions sheet explaining every field. Declared
// before '/:id' so the path isn't taken for a product id.
router.get(
  '/sample-template',
  asyncHandler(async (req, res) => {
    const workbook = buildSampleTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.xlsx"');
    res.setHeader('Content-Length', workbook.length);
    res.send(workbook);
  })
);

// Reads an uploaded file and works out exactly what importing it would do,
// without doing any of it. Both endpoints go through this, so a file that
// validates clean cannot then behave differently on upload.
async function inspectUpload(req, res) {
  // Existing products are matched within the uploader's own catalogue only.
  const ownerId = req.user.id;

  await receiveUpload(req, res);

  if (!req.file) {
    throw new ApiError(400, 'Attach a .xlsx or .csv file.');
  }

  let parsed;
  try {
    parsed = parseProductWorkbook(req.file.buffer);
  } catch (err) {
    // A file that can't be read at all is a bad request, not a crash.
    throw new ApiError(400, err.message);
  }

  if (parsed.rows.length === 0) {
    throw new ApiError(400, 'The sheet has no product rows.');
  }

  // Two queries for the whole file rather than a lookup per row: the codes
  // it names, and the names it uses. A row matches an existing product by
  // code when it gives one, and by name when it doesn't.
  //
  // Codes are compared exactly, matching the case-sensitive UNIQUE
  // constraint and the Add Product form; names are compared
  // case-insensitively, since a product name is prose rather than a key.
  const providedCodes = parsed.rows.map((row) => String(row.cells.code ?? '').trim()).filter(Boolean);
  const providedNames = parsed.rows.map((row) => String(row.cells.name ?? '').trim()).filter(Boolean);

  const [byCode, byName] = await Promise.all([
    findProductsByCodes(ownerId, providedCodes),
    findProductsByNames(ownerId, providedNames),
  ]);

  const productsByCode = new Map(byCode.map((product) => [product.code, product]));
  const productsByName = new Map();
  for (const product of byName) {
    const key = product.name.toLowerCase();
    if (!productsByName.has(key)) productsByName.set(key, []);
    productsByName.get(key).push(product);
  }

  const { errors, inserts, updates } = validateImportRows(parsed.rows, { productsByCode, productsByName });

  // Second gate: the import's rules are looser than the Add Product form's,
  // but what they produce must still be something the product API would
  // accept — so nothing can reach the database that the app itself would
  // have rejected. Inserts are checked whole; an update is checked as the
  // product it WILL BE once the patch is applied, which is what actually
  // has to satisfy the table's constraints.
  const finalErrors = [...errors];
  const acceptedInserts = [];
  const acceptedUpdates = [];

  for (const row of inserts) {
    // A generated code is assigned at insert time, so stand one in purely
    // for this check — it is never the value that gets stored.
    const candidate = { ...row.payload, code: row.payload.code ?? 'GENERATED-AT-INSERT' };
    const { errors: schemaErrors } = validateProductPayload(candidate, { partial: false });
    if (schemaErrors.length > 0) {
      finalErrors.push(...schemaErrors.map((message) => ({ row: row.row, field: 'Row', message })));
    } else {
      acceptedInserts.push(row);
    }
  }

  for (const row of updates) {
    const merged = {
      name: row.patch.name ?? row.existing.name,
      code: row.existing.code,
      company: 'company' in row.patch ? row.patch.company : row.existing.company,
      packing: 'packing' in row.patch ? row.patch.packing : row.existing.packing,
      unit: 'unit' in row.patch ? row.patch.unit : row.existing.unit,
      mrp: 'mrp' in row.patch ? row.patch.mrp : Number(row.existing.mrp),
      salePrice: 'salePrice' in row.patch ? row.patch.salePrice : Number(row.existing.sale_price),
      discount: 'discount' in row.patch ? row.patch.discount : Number(row.existing.discount),
      bonusSchemes: 'bonusSchemes' in row.patch ? row.patch.bonusSchemes : row.existing.bonus_schemes,
    };
    const { errors: schemaErrors } = validateProductPayload(merged, { partial: false });
    if (schemaErrors.length > 0) {
      finalErrors.push(...schemaErrors.map((message) => ({ row: row.row, field: 'Row', message })));
    } else {
      acceptedUpdates.push(row);
    }
  }

  finalErrors.sort((a, b) => a.row - b.row);

  return {
    totalRows: parsed.rows.length,
    unmappedHeaders: parsed.unmappedHeaders,
    errors: finalErrors,
    inserts: acceptedInserts,
    updates: acceptedUpdates,
  };
}

// Summarises what an import would do, for the response body.
function summarise({ totalRows, inserts, updates }) {
  return {
    totalRows,
    validRows: inserts.length + updates.length,
    invalidRows: totalRows - inserts.length - updates.length,
    newProducts: inserts.length,
    updatedProducts: updates.length,
    generatedCodes: inserts.filter((row) => !row.payload.code).length,
  };
}

// Describes an upsert in a sentence, so the UI doesn't have to assemble one.
function describe(summary) {
  const parts = [];
  if (summary.newProducts > 0) {
    parts.push(`${summary.newProducts} new product${summary.newProducts === 1 ? '' : 's'}`);
  }
  if (summary.updatedProducts > 0) {
    parts.push(`${summary.updatedProducts} existing product${summary.updatedProducts === 1 ? '' : 's'} to update`);
  }
  return parts.length > 0 ? parts.join(' and ') : 'nothing to do';
}

// Checks a file without writing anything.
//
// This is the first half of a two-step import: the booker tests the file,
// fixes whatever is reported, and only then uploads. Nothing here touches
// the database beyond reading the products the file refers to.
router.post(
  '/validate-bulk',
  asyncHandler(async (req, res) => {
    const inspection = await inspectUpload(req, res);
    const summary = summarise(inspection);

    res.json({
      isValid: inspection.errors.length === 0,
      summary,
      unmappedHeaders: inspection.unmappedHeaders,
      errors: inspection.errors,
      // Which existing products would change, and how they were matched, so
      // the user can see an update is aimed where they expect before it
      // happens.
      updates: inspection.updates.map((row) => ({
        row: row.row,
        code: row.code,
        name: row.existing.name,
        matchedBy: row.matchedBy,
        changes: Object.keys(row.patch),
      })),
      message:
        inspection.errors.length === 0
          ? `All ${summary.totalRows} row${summary.totalRows === 1 ? '' : 's'} look good — ${describe(summary)}.${
              summary.generatedCodes > 0
                ? ` ${summary.generatedCodes} product code${summary.generatedCodes === 1 ? ' will be' : 's will be'} generated automatically.`
                : ''
            }`
          : `${summary.invalidRows} of ${summary.totalRows} rows need fixing before this file can be imported.`,
    });
  })
);

// Imports the file: new products inserted, matching ones updated, in a
// single transaction. Runs exactly the checks validate-bulk ran — the
// client is never trusted to have called it.
//
// Refuses outright if anything is wrong (422), so an import is all-or-
// nothing: a spreadsheet is meant to be correct, and half-applying one
// leaves the user to work out what did and didn't land. `validate-bulk`
// exists precisely so this refusal is never a surprise.
router.post(
  '/bulk-upload',
  asyncHandler(async (req, res) => {
    const inspection = await inspectUpload(req, res);
    const summary = summarise(inspection);

    if (inspection.errors.length > 0) {
      // Nothing has been written — the upsert below hasn't run.
      return res.status(422).json({
        isValid: false,
        imported: 0,
        updated: 0,
        summary,
        unmappedHeaders: inspection.unmappedHeaders,
        errors: inspection.errors,
        message: 'Nothing was imported. Fix the rows listed below and upload the file again.',
      });
    }

    let result;
    try {
      result = await bulkUpsertProducts(req.user.id, {
        inserts: inspection.inserts.map((row) => ({ ...row.payload })),
        updates: inspection.updates.map((row) => ({ productId: row.productId, patch: row.patch })),
      });
    } catch (err) {
      // The unique index is the last word on codes: another import may have
      // claimed one between the check above and this write.
      if (err.code === '23505') {
        throw new ApiError(
          409,
          'A product code in this file was taken by someone else while the import was running. Nothing was imported — please upload the file again.'
        );
      }
      throw err;
    }

    res.status(201).json({
      isValid: true,
      imported: result.inserted.length,
      updated: result.updated.length,
      summary,
      unmappedHeaders: inspection.unmappedHeaders,
      errors: [],
      products: [...result.inserted, ...result.updated].map(toPublicProduct),
      message: `Imported ${result.inserted.length} new product${
        result.inserted.length === 1 ? '' : 's'
      } and updated ${result.updated.length} existing one${result.updated.length === 1 ? '' : 's'}.${
        summary.generatedCodes > 0
          ? ` ${summary.generatedCodes} code${summary.generatedCodes === 1 ? ' was' : 's were'} generated.`
          : ''
      }`,
    });
  })
);

// Declared before '/:id' — otherwise that route matches 'companies' and
// tries to look it up as a product id.
router.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const companies = await listProductCompanies(req.user.id);
    res.json({ companies });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    requireValidId(req.params.id);

    const product = await findProductById(req.user.id, req.params.id);
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

    const existing = await findProductById(req.user.id, req.params.id);
    if (!existing) {
      throw new ApiError(404, 'Product not found.');
    }

    const { data, errors } = validateProductPayload(req.body ?? {}, { partial: true });
    if (errors.length > 0) {
      throw new ApiError(400, errors[0], errors);
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'At least one field must be provided.');
    }

    if (data.code && data.code !== existing.code) {
      const codeOwner = await findProductByCode(req.user.id, data.code);
      if (codeOwner && codeOwner.id !== existing.id) {
        throw new ApiError(409, 'Product code already exists.');
      }
    }

    let updated;
    try {
      updated = await updateProduct(req.user.id, req.params.id, data);
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

    const updated = await deactivateProduct(req.user.id, req.params.id);
    if (!updated) {
      throw new ApiError(404, 'Product not found.');
    }

    res.json({ product: toPublicProduct(updated) });
  })
);

export default router;
