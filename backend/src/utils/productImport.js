import * as XLSX from 'xlsx';

// Bulk product import: reading a spreadsheet, deciding what each row would
// do, and producing the sample template.
//
// The import is an UPSERT. A row that matches a product already in the
// catalogue updates it; anything else is inserted. That makes re-importing
// an updated price list the normal case rather than a source of duplicates.
//
// Its validation rules are deliberately LOOSER than the Add Product form's:
//
//   * only Product Name and Sale Price are required
//   * Product Code is optional — one is generated when it is left blank
//   * on a NEW product, MRP, Discount and the scheme quantities default to 0
//   * on an EXISTING product, a blank cell means "leave this alone"
//
// That last rule matters most. A price list arriving from a supplier is not
// a carefully filled-in form, and treating its blank columns as zeros would
// quietly wipe MRPs and schemes off products already being ordered.
//
// What the import must never do is write a product the database would
// reject, so every row's resulting product is checked against the shared
// product validator before anything is saved (see routes/products.routes.js).

// The template's columns, in order. `required` drives both the template's
// header markers and the validation below; `aliases` are the other headers
// accepted, so a sheet exported from somewhere else usually imports without
// being reshaped by hand.
export const TEMPLATE_COLUMNS = [
  {
    header: 'Product Name',
    key: 'name',
    required: true,
    aliases: ['name', 'product'],
    note: 'REQUIRED. The product name as it should appear in the app.',
  },
  {
    header: 'Sale Price',
    key: 'salePrice',
    required: true,
    aliases: ['price', 'rate', 'saleprice'],
    note: 'REQUIRED. A number greater than 0 — this is the rate orders are priced at.',
  },
  {
    header: 'Product Code',
    key: 'code',
    aliases: ['code', 'sku', 'itemcode'],
    note: 'Optional. Give the code of an existing product to UPDATE it. Leave blank and the product is matched by name instead, or created with a generated code (PROD-0001, PROD-0002, …).',
  },
  {
    header: 'MRP',
    key: 'mrp',
    aliases: ['maximumretailprice'],
    note: 'Optional. New product: defaults to 0. Existing product: left blank means keep the current MRP.',
  },
  {
    header: 'Discount',
    key: 'discount',
    aliases: ['discountpercent', 'discountpercentage'],
    note: 'Optional. A percentage between 0 and 100 — enter 10 for 10%, not 0.1. New product: defaults to 0. Existing product: left blank means keep the current discount.',
  },
  {
    header: 'Scheme Purchase Qty',
    key: 'schemePurchaseQty',
    aliases: ['purchaseqty', 'purchasequantity', 'schemepurchasequantity'],
    note: 'Optional. The 20 in "20 + 2". Enter 0 to remove a scheme. New product: blank means no scheme. Existing product: blank means keep the current scheme.',
  },
  {
    header: 'Scheme Bonus Qty',
    key: 'schemeBonusQty',
    aliases: ['bonusqty', 'bonusquantity', 'schemebonusquantity'],
    note: 'Optional. The 2 in "20 + 2". Only used when a Purchase Qty above 0 is given in the same row.',
  },
  {
    header: 'Company',
    key: 'company',
    aliases: ['manufacturer', 'companyname'],
    note: 'Optional. The manufacturer. Company-wise sales targets are set against this name. On an existing product, left blank means keep the current company.',
  },
  { header: 'Packing', key: 'packing', aliases: [], note: 'Optional. e.g. 10x10.' },
  { header: 'Unit', key: 'unit', aliases: [], note: 'Optional. e.g. Box, Bottle, Piece.' },
];

const COLUMN_BY_KEY = new Map(TEMPLATE_COLUMNS.map((column) => [column.key, column]));

// The column name to quote in an error, so a message points at the heading
// the user can actually see in their spreadsheet.
function fieldLabel(key) {
  return COLUMN_BY_KEY.get(key)?.header ?? key;
}

// Headers are matched loosely — case, spaces, punctuation and the required
// marker are all ignored — because a human types the header row.
function normalizeHeader(header) {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_LOOKUP = new Map();
for (const column of TEMPLATE_COLUMNS) {
  HEADER_LOOKUP.set(normalizeHeader(column.header), column.key);
  HEADER_LOOKUP.set(normalizeHeader(column.key), column.key);
  for (const alias of column.aliases) {
    HEADER_LOOKUP.set(normalizeHeader(alias), column.key);
  }
}

const TRUE_VALUES = new Set(['yes', 'y', 'true', 't', '1', 'enabled', 'on']);
const FALSE_VALUES = new Set(['no', 'n', 'false', 'f', '0', 'disabled', 'off']);

export const MAX_IMPORT_ROWS = 1000;
export const AUTO_CODE_PREFIX = 'PROD-';

const FIELD_LIMITS = { name: 200, code: 50, company: 150, packing: 100, unit: 50 };

// Text cells arrive as strings, but a code like 1001 arrives as a number and
// a blank cell may be undefined.
function readText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function isBlank(value) {
  return readText(value) === '';
}

// Parses a number that may have arrived as a numeric cell or as text.
// Returns `null` when the text isn't a number at all, so "abc" can be
// reported differently from a blank cell.
function readNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = readText(value);
  if (text === '') return undefined;
  // Tolerates thousands separators and a currency symbol, which price lists
  // very often carry.
  const cleaned = text.replace(/[,\s]/g, '').replace(/^[^\d.-]+/, '');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

// Reads a .xlsx or .csv buffer into raw, still-unvalidated rows.
export function parseProductWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new Error(`The file could not be read as a spreadsheet: ${err.message}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The file contains no sheets.');
  }

  const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true });

  if (raw.length === 0) {
    throw new Error('The sheet has no data rows — only a header row, or nothing at all.');
  }
  if (raw.length > MAX_IMPORT_ROWS) {
    throw new Error(`The sheet has ${raw.length} rows; at most ${MAX_IMPORT_ROWS} can be imported at once.`);
  }

  const unmappedHeaders = new Set();
  const rows = [];

  raw.forEach((record, index) => {
    // +2: the header occupies row 1 and spreadsheets are 1-indexed, so this
    // is the row number the user sees in Excel.
    const rowNumber = index + 2;

    const cells = {};
    let schemeEnabledCell;

    for (const [header, value] of Object.entries(record)) {
      const key = HEADER_LOOKUP.get(normalizeHeader(header));
      if (key) {
        cells[key] = value;
      } else if (normalizeHeader(header) === 'schemeenabled' || normalizeHeader(header) === 'bonusscheme') {
        // No longer a template column — the scheme is switched on by giving
        // a Purchase Qty — but sheets saved from the old template still
        // carry it, and a contradictory Yes should be reported rather than
        // silently ignored.
        schemeEnabledCell = value;
      } else if (!isBlank(value)) {
        unmappedHeaders.add(header);
      }
    }

    // A row where every mapped cell is blank is padding, not a mistake.
    const allBlank = TEMPLATE_COLUMNS.every((column) => isBlank(cells[column.key]));
    if (allBlank && isBlank(schemeEnabledCell)) return;

    rows.push({ rowNumber, cells, schemeEnabledCell });
  });

  return { rows, unmappedHeaders: [...unmappedHeaders] };
}

// Validates one parsed row.
//
// Returns the parsed `values`, plus `provided` — which columns the sheet
// actually filled in. That distinction is what makes the upsert safe: on a
// NEW product a blank cell takes its default (MRP 0, no scheme), but on an
// EXISTING one a blank cell means "leave this alone" rather than "set it to
// zero". Wiping a product's price because a column was left out of a
// spreadsheet would be silent data loss.
//
// Errors are per FIELD, named by the spreadsheet column, so the caller can
// tell the user exactly which cell to fix.
function validateRow(row) {
  const errors = [];
  const { cells } = row;
  const add = (key, message) => errors.push({ row: row.rowNumber, field: fieldLabel(key), message });

  // --- Product Name: required ---
  const name = readText(cells.name);
  if (name === '') {
    add('name', 'Required — every product needs a name.');
  } else if (name.length > FIELD_LIMITS.name) {
    add('name', `Must be at most ${FIELD_LIMITS.name} characters.`);
  }

  // --- Sale Price: required, must be a real price ---
  const salePrice = readNumber(cells.salePrice);
  if (salePrice === undefined) {
    add('salePrice', 'Required — enter the price this product sells at.');
  } else if (salePrice === null) {
    add('salePrice', `Must be a positive number (got "${readText(cells.salePrice)}").`);
  } else if (salePrice <= 0) {
    add('salePrice', 'Must be a positive number, greater than 0.');
  }

  // --- Product Code: optional, generated when blank ---
  const code = readText(cells.code);
  if (code !== '' && code.length > FIELD_LIMITS.code) {
    add('code', `Must be at most ${FIELD_LIMITS.code} characters.`);
  }

  // --- MRP: optional, defaults to 0 ---
  const mrpRaw = readNumber(cells.mrp);
  let mrp = 0;
  if (mrpRaw === null) {
    add('mrp', `Must be a number (got "${readText(cells.mrp)}"). Leave it blank for 0.`);
  } else if (mrpRaw !== undefined) {
    if (mrpRaw < 0) add('mrp', 'Must not be negative.');
    else mrp = mrpRaw;
  }

  // --- Discount: optional, defaults to 0 ---
  const discountRaw = readNumber(cells.discount);
  let discount = 0;
  if (discountRaw === null) {
    add('discount', `Must be a number (got "${readText(cells.discount)}"). Leave it blank for 0.`);
  } else if (discountRaw !== undefined) {
    if (discountRaw < 0 || discountRaw > 100) add('discount', 'Must be a percentage between 0 and 100.');
    else discount = discountRaw;
  }

  // --- Scheme quantities: optional, default to 0, and 0 means no scheme ---
  const purchaseRaw = readNumber(cells.schemePurchaseQty);
  let purchaseQty = 0;
  if (purchaseRaw === null) {
    add('schemePurchaseQty', `Must be a whole number (got "${readText(cells.schemePurchaseQty)}"). Leave it blank for no scheme.`);
  } else if (purchaseRaw !== undefined) {
    if (!Number.isInteger(purchaseRaw) || purchaseRaw < 0) {
      add('schemePurchaseQty', 'Must be a whole number, 0 or more.');
    } else {
      purchaseQty = purchaseRaw;
    }
  }

  const bonusRaw = readNumber(cells.schemeBonusQty);
  let bonusQty = 0;
  if (bonusRaw === null) {
    add('schemeBonusQty', `Must be a whole number (got "${readText(cells.schemeBonusQty)}"). Leave it blank for 0.`);
  } else if (bonusRaw !== undefined) {
    if (!Number.isInteger(bonusRaw) || bonusRaw < 0) {
      add('schemeBonusQty', 'Must be a whole number, 0 or more.');
    } else {
      bonusQty = bonusRaw;
    }
  }

  // The scheme is on when a purchase quantity above 0 is given — there is no
  // separate on/off column any more. A leftover "Scheme Enabled: Yes" with
  // no quantity is contradictory, so it is reported rather than ignored.
  const schemeProvided = purchaseRaw !== undefined && purchaseRaw !== null;
  if (!isBlank(row.schemeEnabledCell)) {
    const flag = readText(row.schemeEnabledCell).toLowerCase();
    const saidYes = TRUE_VALUES.has(flag);
    const saidNo = FALSE_VALUES.has(flag);
    if (!saidYes && !saidNo) {
      add('schemePurchaseQty', `"Scheme Enabled" must be Yes or No (got "${readText(row.schemeEnabledCell)}").`);
    } else if (saidYes && purchaseQty <= 0) {
      add('schemePurchaseQty', 'Required when "Scheme Enabled" is Yes — enter the purchase quantity, e.g. 20.');
    }
  }

  // The scheme is three fields that only make sense together, so it is only
  // ever changed as a unit. A bonus quantity on its own can't be acted on:
  // without a purchase quantity there is no scheme to attach it to.
  if (!schemeProvided && bonusRaw !== undefined && bonusRaw !== null) {
    add('schemePurchaseQty', 'Also needed — a Bonus Qty on its own has no scheme to attach to. Enter the purchase quantity, e.g. 20.');
  }

  const company = readText(cells.company);
  const packing = readText(cells.packing);
  const unit = readText(cells.unit);
  for (const [key, value] of [['company', company], ['packing', packing], ['unit', unit]]) {
    if (value.length > FIELD_LIMITS[key]) {
      add(key, `Must be at most ${FIELD_LIMITS[key]} characters.`);
    }
  }

  const values = {
    name,
    code: code || null,
    company: company || null,
    packing: packing || null,
    unit: unit || null,
    mrp,
    salePrice: salePrice === undefined || salePrice === null ? 0 : salePrice,
    discount,
    schemeEnabled: purchaseQty > 0,
    schemePurchaseQty: purchaseQty > 0 ? purchaseQty : null,
    schemeBonusQty: purchaseQty > 0 ? bonusQty : null,
  };

  // A cell counts as "provided" when it held something — not merely when it
  // parsed. An unparseable cell has already produced an error above.
  const provided = {
    name: name !== '',
    code: code !== '',
    company: !isBlank(cells.company),
    packing: !isBlank(cells.packing),
    unit: !isBlank(cells.unit),
    mrp: mrpRaw !== undefined && mrpRaw !== null,
    salePrice: salePrice !== undefined && salePrice !== null,
    discount: discountRaw !== undefined && discountRaw !== null,
    scheme: schemeProvided,
  };

  return { errors, values, provided };
}

// Validates every row of a parsed file and works out, for each one, whether
// it creates a product or updates one that already exists.
//
// MATCHING (PROJECT_SPEC-independent behaviour, defined here):
//
//   * A row that gives a Product Code matches the product with exactly that
//     code. If nothing has that code, the row is a NEW product using it —
//     it does NOT then fall back to matching by name, because an explicitly
//     supplied new code says "this is a new product".
//   * A row that leaves Product Code blank matches an existing product by
//     NAME, compared case-insensitively. That product keeps its own code;
//     an update never changes a product's code, which is what keeps the
//     unique constraint safe.
//   * Anything unmatched is inserted, with a code generated at save time.
//
// Inactive products are matched too. Skipping them would let an import
// insert a duplicate code and fail; an update leaves `is_active` untouched,
// so a deactivated product is not silently brought back into circulation.
export function validateImportRows(rows, { productsByCode = new Map(), productsByName = new Map() } = {}) {
  const errors = [];
  const inserts = [];
  const updates = [];

  // Guards against two rows acting on the same product, and against two new
  // products claiming the same code or name.
  const claimedProductIds = new Map();
  const claimedCodes = new Map();
  const claimedNames = new Map();

  for (const row of rows) {
    const { errors: rowErrors, values, provided } = validateRow(row);
    const problems = [...rowErrors];
    const add = (field, message) => problems.push({ row: row.rowNumber, field, message });

    const nameKey = values.name.toLowerCase();
    let match = null;

    if (provided.code) {
      match = productsByCode.get(values.code) ?? null;

      if (!match) {
        // A brand-new product carrying an explicit code. Two rows can't
        // both claim it.
        if (claimedCodes.has(values.code)) {
          add(fieldLabel('code'), `"${values.code}" is already used on row ${claimedCodes.get(values.code)} of this file.`);
        } else {
          claimedCodes.set(values.code, row.rowNumber);
        }
      }
    } else if (values.name !== '') {
      const candidates = productsByName.get(nameKey) ?? [];
      if (candidates.length === 1) {
        [match] = candidates;
      } else if (candidates.length > 1) {
        // Product names aren't unique in the database, so a name match can
        // be genuinely ambiguous. Guessing which product to overwrite would
        // be the worst possible answer.
        add(
          fieldLabel('name'),
          `${candidates.length} existing products are called "${values.name}" (codes ${candidates
            .map((product) => product.code)
            .join(', ')}). Add a Product Code to this row to say which one you mean.`
        );
      }
    }

    if (match) {
      if (claimedProductIds.has(match.id)) {
        add(
          fieldLabel(provided.code ? 'code' : 'name'),
          `This row and row ${claimedProductIds.get(match.id)} both update the same product (${match.code}). Keep only one of them.`
        );
      } else {
        claimedProductIds.set(match.id, row.rowNumber);
      }
    } else if (values.name !== '' && !provided.code) {
      // Two new products with the same name and no codes would match each
      // other on the next import, so the ambiguity is refused now.
      if (claimedNames.has(nameKey)) {
        add(fieldLabel('name'), `"${values.name}" is already used on row ${claimedNames.get(nameKey)} of this file.`);
      } else {
        claimedNames.set(nameKey, row.rowNumber);
      }
    }

    if (problems.length > 0) {
      errors.push(...problems);
      continue;
    }

    if (match) {
      // Only what the sheet actually specified is changed. Everything else
      // keeps the value the product already has.
      const patch = { name: values.name };
      if (provided.company) patch.company = values.company;
      if (provided.packing) patch.packing = values.packing;
      if (provided.unit) patch.unit = values.unit;
      if (provided.mrp) patch.mrp = values.mrp;
      if (provided.salePrice) patch.salePrice = values.salePrice;
      if (provided.discount) patch.discount = values.discount;
      if (provided.scheme) {
        patch.schemeEnabled = values.schemeEnabled;
        patch.schemePurchaseQty = values.schemePurchaseQty;
        patch.schemeBonusQty = values.schemeBonusQty;
      }

      updates.push({
        row: row.rowNumber,
        productId: match.id,
        code: match.code,
        matchedBy: provided.code ? 'code' : 'name',
        existing: match,
        patch,
      });
    } else {
      // Defaults apply here and only here: a new product with a blank MRP
      // really is 0.
      inserts.push({ row: row.rowNumber, payload: { ...values } });
    }
  }

  errors.sort((a, b) => a.row - b.row);

  return { errors, inserts, updates };
}

// Builds the sample template. Required columns come first and are marked
// with a * in the header — the header matcher ignores punctuation, so the
// marker is cosmetic and the file still imports unchanged. The Instructions
// sheet spells out Required vs Optional and every default.
export function buildSampleTemplate() {
  const headers = TEMPLATE_COLUMNS.map((column) => (column.required ? `${column.header} *` : column.header));

  // Deliberately shows the defaults at work: the second row leaves the code,
  // MRP and scheme blank, which is a perfectly valid import.
  const examples = [
    ['Panadol 500mg', 500, 'P-001', 600, 10, 20, 2, 'GSK', '10x10', 'Box'],
    ['Augmentin 625mg', 350, '', '', '', '', '', 'GSK', '1x6', 'Box'],
  ];

  const products = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  products['!cols'] = headers.map((header) => ({ wch: Math.max(header.length + 4, 14) }));

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required?', 'Notes'],
    ...TEMPLATE_COLUMNS.map((column) => [column.header, column.required ? 'REQUIRED' : 'Optional', column.note]),
    [],
    ['How the import works', '', ''],
    ['', '', 'Only Product Name and Sale Price must be filled in. Every other column can be left blank.'],
    ['', '', 'UPDATE OR ADD: each row either updates a product you already have, or adds a new one.'],
    ['', '', 'A row is matched to an existing product by Product Code when you give one, or by Product Name (ignoring capitals) when you do not.'],
    ['', '', `No match? The row is added as a new product, with a code generated for you (${AUTO_CODE_PREFIX}0001, ${AUTO_CODE_PREFIX}0002, …) if you left Product Code blank.`],
    ['', '', 'On a NEW product, blank MRP / Discount / Scheme columns mean 0.'],
    ['', '', 'On an EXISTING product, a blank column is LEFT ALONE — it is never overwritten with 0. Only fill in what you want to change.'],
    ['', '', 'A bonus scheme is created only when Scheme Purchase Qty is above 0. Enter 0 to remove an existing scheme.'],
    ['', '', 'Updating never changes a product code, and never reactivates a deactivated product.'],
    ['', '', 'Column headers are matched ignoring case, spaces and punctuation. Extra columns are ignored.'],
    ['', '', 'Use "Test / Validate File" first — it shows how many products would be added and how many updated, and changes nothing.'],
    ['', '', 'New products are added as Active.'],
    ['', '', `At most ${MAX_IMPORT_ROWS} rows per file.`],
  ]);
  instructions['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 105 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, products, 'Products');
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
