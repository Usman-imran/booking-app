import pool from '../config/db.js';
import { normaliseSchemes } from '../utils/bonusSchemes.js';
import { AUTO_CODE_PREFIX } from '../utils/productImport.js';

// Every product belongs to exactly one user (owner_id) and is invisible to
// everyone else. Each function here takes the owner explicitly and folds it
// into the WHERE clause, so a product id belonging to another account
// behaves exactly like one that doesn't exist.
const SELECT_FIELDS =
  'id, name, code, company, packing, unit, mrp, sale_price, discount, bonus_schemes, is_active, created_at, updated_at';

// `bonus_schemes` is JSONB. pg would serialise a JavaScript array as a
// Postgres ARRAY literal, which the column rejects, so the value is always
// handed over as a JSON string. Readers get it back already parsed.
function serialiseSchemes(schemes) {
  return JSON.stringify(normaliseSchemes(schemes));
}

// Column values for one row, in a fixed order shared by the single insert
// and the bulk insert so the two can never disagree.
function insertValues(ownerId, data) {
  return [
    ownerId,
    data.name,
    data.code,
    data.company ?? null,
    data.packing ?? null,
    data.unit ?? null,
    data.mrp,
    data.salePrice,
    data.discount,
    serialiseSchemes(data.bonusSchemes),
  ];
}

const UPDATABLE_COLUMNS = {
  name: 'name',
  code: 'code',
  company: 'company',
  packing: 'packing',
  unit: 'unit',
  mrp: 'mrp',
  salePrice: 'sale_price',
  discount: 'discount',
  bonusSchemes: 'bonus_schemes',
  isActive: 'is_active',
};

// The parameter value for an updatable field. Only the schemes need any
// translation; everything else is stored as given.
function columnValue(field, value) {
  return field === 'bonusSchemes' ? serialiseSchemes(value) : value;
}

export async function findProductById(ownerId, id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE owner_id = $1 AND id = $2`, [
    ownerId,
    id,
  ]);
  return rows[0] || null;
}

// Codes are unique per owner, not globally, so the lookup is scoped too.
export async function findProductByCode(ownerId, code) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE owner_id = $1 AND code = $2`, [
    ownerId,
    code,
  ]);
  return rows[0] || null;
}

// Looks up several products at once. Accepts an optional transaction
// `client` so an order can read the products it is snapshotting inside its
// own transaction, rather than through a separate pooled connection.
// Missing ids are simply absent from the result — the caller decides what
// that means.
export async function findProductsByIds(ownerId, ids, client = pool) {
  if (ids.length === 0) {
    return [];
  }
  const { rows } = await client.query(
    `SELECT ${SELECT_FIELDS} FROM products WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
    [ownerId, ids]
  );
  return rows;
}

export async function createProduct(ownerId, data) {
  const { rows } = await pool.query(
    `INSERT INTO products (owner_id, name, code, company, packing, unit, mrp, sale_price, discount, bonus_schemes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${SELECT_FIELDS}`,
    insertValues(ownerId, data)
  );
  return rows[0];
}

// Looks up the products matching a set of codes. Used by the bulk import to
// tell, in one query, which codes are already taken — rather than probing
// once per row (PROJECT_SPEC.md §35: no N+1).
export async function findProductsByCodes(ownerId, codes, client = pool) {
  if (codes.length === 0) {
    return [];
  }
  const { rows } = await client.query(
    `SELECT ${SELECT_FIELDS} FROM products WHERE owner_id = $1 AND code = ANY($2::text[])`,
    [ownerId, codes]
  );
  return rows;
}

// Looks up products by name, compared case-insensitively. Used by the bulk
// import to match a row that gave no Product Code against a product that
// already exists.
//
// Names are NOT unique in this table, so this returns every match and the
// caller decides what an ambiguous one means — guessing which product to
// overwrite would be the worst possible answer.
export async function findProductsByNames(ownerId, names, client = pool) {
  if (names.length === 0) {
    return [];
  }
  const { rows } = await client.query(
    `SELECT ${SELECT_FIELDS} FROM products WHERE owner_id = $1 AND lower(name) = ANY($2::text[])`,
    [ownerId, names.map((name) => name.toLowerCase())]
  );
  return rows;
}

// Generates the next N automatic product codes (PROD-0001, PROD-0002, …).
//
// Runs on the caller's transaction and starts by taking a transaction-level
// advisory lock, so two imports uploaded at the same moment queue up instead
// of both reading the same highest code and generating the same numbers.
// The lock is released automatically at COMMIT or ROLLBACK. It is keyed by
// owner, because codes are unique per owner: two different users importing
// at once never contend, and each gets their own PROD-0001.
//
// Numbering continues from the highest PROD-##### already in this owner's
// products, so codes are never reused even after products are edited or
// removed. Codes supplied explicitly in the same file are skipped, since
// those rows are about to claim them.
async function generateProductCodes(client, ownerId, count, reservedCodes) {
  if (count === 0) return [];

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`product_code_generation:${ownerId}`]);

  const { rows } = await client.query(
    `SELECT COALESCE(MAX((substring(code from '^${AUTO_CODE_PREFIX}([0-9]+)$'))::bigint), 0) AS max_suffix
     FROM products
     WHERE owner_id = $1 AND code ~ '^${AUTO_CODE_PREFIX}[0-9]+$'`,
    [ownerId]
  );

  let next = Number(rows[0].max_suffix) + 1;
  const reserved = new Set(reservedCodes);
  const codes = [];

  while (codes.length < count) {
    const candidate = `${AUTO_CODE_PREFIX}${String(next).padStart(4, '0')}`;
    next += 1;
    // Starting above the highest existing PROD-##### rules out a clash with
    // the table; this only has to dodge codes typed into this same file.
    if (reserved.has(candidate)) continue;
    codes.push(candidate);
  }

  return codes;
}

// Applies a whole bulk import in ONE transaction: new products inserted,
// existing ones updated, all or nothing. A half-applied import would leave
// the user to work out which rows landed, which is worse than none of them.
//
// `inserts` are full product payloads; a null `code` gets one generated here
// — inside the same transaction as the write, which is what makes it safe
// against a concurrent import. `updates` are `{ productId, patch }`, where
// the patch holds ONLY the fields the spreadsheet actually specified, so a
// column left out of the sheet keeps whatever the product already has.
//
// A product's `code` and `is_active` are never changed by an update: the
// code is the identity the unique constraint rests on, and reactivating a
// deliberately deactivated product is not something a price list should do
// silently.
export async function bulkUpsertProducts(ownerId, { inserts = [], updates = [] }) {
  if (inserts.length === 0 && updates.length === 0) {
    return { inserted: [], updated: [] };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const needsCode = inserts.filter((row) => !row.code);
    if (needsCode.length > 0) {
      const generated = await generateProductCodes(
        client,
        ownerId,
        needsCode.length,
        inserts.map((row) => row.code).filter(Boolean)
      );
      needsCode.forEach((row, index) => {
        row.code = generated[index];
      });
    }

    let inserted = [];
    if (inserts.length > 0) {
      const columns = [
        'owner_id',
        'name',
        'code',
        'company',
        'packing',
        'unit',
        'mrp',
        'sale_price',
        'discount',
        'bonus_schemes',
      ];

      const params = [];
      const valueGroups = inserts.map((data) => {
        const offset = params.length;
        params.push(...insertValues(ownerId, data));
        return `(${columns.map((_, index) => `$${offset + index + 1}`).join(', ')})`;
      });

      const result = await client.query(
        `INSERT INTO products (${columns.join(', ')})
         VALUES ${valueGroups.join(', ')}
         RETURNING ${SELECT_FIELDS}`,
        params
      );
      inserted = result.rows;
    }

    // Updates are applied one statement per row rather than one bulk
    // statement, because each row changes a DIFFERENT set of columns — a
    // single UPDATE ... FROM (VALUES ...) would have to supply every column
    // for every row, which is exactly the overwrite-with-blanks this is
    // designed to avoid. They all share one transaction, and an import is
    // capped at 1000 rows.
    const updated = [];
    for (const { productId, patch } of updates) {
      const setClauses = [];
      const params = [];

      for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
          params.push(columnValue(field, patch[field]));
          setClauses.push(`${column} = $${params.length}`);
        }
      }

      if (setClauses.length === 0) continue;

      // The owner check is belt and braces: the ids came from this owner's
      // own lookups, but a row can never be rewritten across accounts.
      params.push(ownerId, productId);
      const result = await client.query(
        `UPDATE products SET ${setClauses.join(', ')}
         WHERE owner_id = $${params.length - 1} AND id = $${params.length}
         RETURNING ${SELECT_FIELDS}`,
        params
      );
      if (result.rows[0]) updated.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return { inserted, updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Applies only the fields present in `data` (partial update).
export async function updateProduct(ownerId, id, data) {
  const setClauses = [];
  const params = [];

  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      params.push(columnValue(field, data[field]));
      setClauses.push(`${column} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findProductById(ownerId, id);
  }

  params.push(ownerId, id);
  const { rows } = await pool.query(
    `UPDATE products SET ${setClauses.join(', ')}
     WHERE owner_id = $${params.length - 1} AND id = $${params.length}
     RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows[0] || null;
}

export async function deactivateProduct(ownerId, id) {
  const { rows } = await pool.query(
    `UPDATE products SET is_active = false WHERE owner_id = $1 AND id = $2 RETURNING ${SELECT_FIELDS}`,
    [ownerId, id]
  );
  return rows[0] || null;
}

export async function listProducts(ownerId, { search, isActive, ids, company, page, limit }) {
  const params = [ownerId];
  const conditions = ['owner_id = $1'];

  // Restricts the list to a specific set of products. Used when a saved
  // draft is reopened and every line has to be re-priced from the products'
  // current values in one request instead of one request per line.
  if (ids) {
    params.push(ids);
    conditions.push(`id = ANY($${params.length}::uuid[])`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    conditions.push(`is_active = $${params.length}`);
  }

  // Strictly one manufacturer — an exact match, not the partial ILIKE that
  // `search` uses, so browsing "GSK" can never pull in "GSK Consumer".
  // Compared case-insensitively for the same reason company-wise targets
  // are: the name is typed by hand in more than one place.
  if (company) {
    params.push(company);
    conditions.push(`lower(company) = lower($${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM products ${whereClause}`, params);
  const total = countResult.rows[0].total;

  const dataParams = [...params, limit, (page - 1) * limit];
  const { rows } = await pool.query(
    `SELECT ${SELECT_FIELDS} FROM products ${whereClause}
     ORDER BY name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  );

  return { rows, total };
}

// The distinct manufacturers products are assigned to. Company-wise
// targets are set against these names (PROJECT_SPEC.md §19 as extended), and
// there is no companies table to read them from — Company is a field on the
// product (§5), so this is the list.
export async function listProductCompanies(ownerId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT company FROM products
     WHERE owner_id = $1 AND company IS NOT NULL AND btrim(company) <> ''
     ORDER BY company ASC`,
    [ownerId]
  );
  return rows.map((row) => row.company);
}

// Every manufacturer that has at least one ACTIVE product, with how many
// it has. This is what the Companies section browses.
//
// Companies aren't an entity in this application — Company is a field on
// the product (PROJECT_SPEC.md §5) and there is deliberately no companies
// table (§21, §27) — so the list is derived from the products themselves.
// A manufacturer whose products have all been deactivated therefore drops
// out of the list, which is the intent: it has nothing left to sell.
export async function listCompaniesWithCounts(ownerId) {
  const { rows } = await pool.query(
    `SELECT company, COUNT(*)::int AS product_count
     FROM products
     WHERE owner_id = $1 AND is_active = true AND company IS NOT NULL AND btrim(company) <> ''
     GROUP BY company
     ORDER BY company ASC`,
    [ownerId]
  );
  return rows.map((row) => ({ company: row.company, productCount: row.product_count }));
}

// `bonusSchemes` is the full, sorted list of tiers. The three single-scheme
// fields alongside it describe the FIRST tier (or no scheme) and exist for
// readers that only ever show one — the "20 + 2" badge on a list row, say.
// They are derived, never stored, and the API accepts them on input only as
// a shorthand for a one-tier array.
export function toPublicProduct(product) {
  const bonusSchemes = normaliseSchemes(product.bonus_schemes);
  const first = bonusSchemes[0] ?? null;
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    company: product.company,
    packing: product.packing,
    unit: product.unit,
    mrp: Number(product.mrp),
    salePrice: Number(product.sale_price),
    discount: Number(product.discount),
    bonusSchemes,
    schemeEnabled: first !== null,
    schemePurchaseQty: first ? first.purchaseQty : null,
    schemeBonusQty: first ? first.bonusQty : null,
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}
