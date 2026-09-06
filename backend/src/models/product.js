import pool from '../config/db.js';
import { AUTO_CODE_PREFIX } from '../utils/productImport.js';

const SELECT_FIELDS =
  'id, name, code, company, packing, unit, mrp, sale_price, discount, scheme_enabled, scheme_purchase_qty, scheme_bonus_qty, is_active, created_at, updated_at';

const UPDATABLE_COLUMNS = {
  name: 'name',
  code: 'code',
  company: 'company',
  packing: 'packing',
  unit: 'unit',
  mrp: 'mrp',
  salePrice: 'sale_price',
  discount: 'discount',
  schemeEnabled: 'scheme_enabled',
  schemePurchaseQty: 'scheme_purchase_qty',
  schemeBonusQty: 'scheme_bonus_qty',
  isActive: 'is_active',
};

export async function findProductById(id) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findProductByCode(code) {
  const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM products WHERE code = $1`, [code]);
  return rows[0] || null;
}

// Looks up several products at once. Accepts an optional transaction
// `client` so an order can read the products it is snapshotting inside its
// own transaction, rather than through a separate pooled connection.
// Missing ids are simply absent from the result — the caller decides what
// that means.
export async function findProductsByIds(ids, client = pool) {
  if (ids.length === 0) {
    return [];
  }
  const { rows } = await client.query(`SELECT ${SELECT_FIELDS} FROM products WHERE id = ANY($1::uuid[])`, [ids]);
  return rows;
}

export async function createProduct(data) {
  const { rows } = await pool.query(
    `INSERT INTO products (name, code, company, packing, unit, mrp, sale_price, discount, scheme_enabled, scheme_purchase_qty, scheme_bonus_qty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_FIELDS}`,
    [
      data.name,
      data.code,
      data.company ?? null,
      data.packing ?? null,
      data.unit ?? null,
      data.mrp,
      data.salePrice,
      data.discount,
      data.schemeEnabled,
      data.schemePurchaseQty,
      data.schemeBonusQty,
    ]
  );
  return rows[0];
}

// Looks up the products matching a set of codes. Used by the bulk import to
// tell, in one query, which codes are already taken — rather than probing
// once per row (PROJECT_SPEC.md §35: no N+1).
export async function findProductsByCodes(codes, client = pool) {
  if (codes.length === 0) {
    return [];
  }
  const { rows } = await client.query(`SELECT ${SELECT_FIELDS} FROM products WHERE code = ANY($1::text[])`, [codes]);
  return rows;
}

// Looks up products by name, compared case-insensitively. Used by the bulk
// import to match a row that gave no Product Code against a product that
// already exists.
//
// Names are NOT unique in this table, so this returns every match and the
// caller decides what an ambiguous one means — guessing which product to
// overwrite would be the worst possible answer.
export async function findProductsByNames(names, client = pool) {
  if (names.length === 0) {
    return [];
  }
  const { rows } = await client.query(
    `SELECT ${SELECT_FIELDS} FROM products WHERE lower(name) = ANY($1::text[])`,
    [names.map((name) => name.toLowerCase())]
  );
  return rows;
}

// Generates the next N automatic product codes (PROD-0001, PROD-0002, …).
//
// Runs on the caller's transaction and starts by taking a transaction-level
// advisory lock, so two imports uploaded at the same moment queue up instead
// of both reading the same highest code and generating the same numbers.
// The lock is released automatically at COMMIT or ROLLBACK.
//
// Numbering continues from the highest PROD-##### already in the table, so
// codes are never reused even after products are edited or removed. Codes
// supplied explicitly in the same file are skipped, since those rows are
// about to claim them.
async function generateProductCodes(client, count, reservedCodes) {
  if (count === 0) return [];

  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['product_code_generation']);

  const { rows } = await client.query(
    `SELECT COALESCE(MAX((substring(code from '^${AUTO_CODE_PREFIX}([0-9]+)$'))::bigint), 0) AS max_suffix
     FROM products
     WHERE code ~ '^${AUTO_CODE_PREFIX}[0-9]+$'`
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
export async function bulkUpsertProducts({ inserts = [], updates = [] }) {
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
        'name',
        'code',
        'company',
        'packing',
        'unit',
        'mrp',
        'sale_price',
        'discount',
        'scheme_enabled',
        'scheme_purchase_qty',
        'scheme_bonus_qty',
      ];

      const params = [];
      const valueGroups = inserts.map((data) => {
        const offset = params.length;
        params.push(
          data.name,
          data.code,
          data.company ?? null,
          data.packing ?? null,
          data.unit ?? null,
          data.mrp,
          data.salePrice,
          data.discount,
          data.schemeEnabled,
          data.schemePurchaseQty,
          data.schemeBonusQty
        );
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
          params.push(patch[field]);
          setClauses.push(`${column} = $${params.length}`);
        }
      }

      if (setClauses.length === 0) continue;

      params.push(productId);
      const result = await client.query(
        `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${SELECT_FIELDS}`,
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
export async function updateProduct(id, data) {
  const setClauses = [];
  const params = [];

  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      params.push(data[field]);
      setClauses.push(`${column} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findProductById(id);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING ${SELECT_FIELDS}`,
    params
  );
  return rows[0] || null;
}

export async function deactivateProduct(id) {
  const { rows } = await pool.query(
    `UPDATE products SET is_active = false WHERE id = $1 RETURNING ${SELECT_FIELDS}`,
    [id]
  );
  return rows[0] || null;
}

export async function listProducts({ search, isActive, ids, page, limit }) {
  const conditions = [];
  const params = [];

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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
export async function listProductCompanies() {
  const { rows } = await pool.query(
    `SELECT DISTINCT company FROM products WHERE company IS NOT NULL AND btrim(company) <> '' ORDER BY company ASC`
  );
  return rows.map((row) => row.company);
}

export function toPublicProduct(product) {
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
    schemeEnabled: product.scheme_enabled,
    schemePurchaseQty: product.scheme_purchase_qty,
    schemeBonusQty: product.scheme_bonus_qty,
    isActive: product.is_active,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}
