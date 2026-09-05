/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Products (PROJECT_SPEC.md §5, §7, §8, §9). Database foundation only —
 * no API/UI yet.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable(
    'products',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      name: {
        type: 'varchar(200)',
        notNull: true,
        check: "btrim(name) <> ''",
      },
      code: {
        type: 'varchar(50)',
        notNull: true,
        unique: true,
        check: "btrim(code) <> ''",
      },
      company: {
        type: 'varchar(150)',
      },
      packing: {
        type: 'varchar(100)',
      },
      unit: {
        type: 'varchar(50)',
      },
      mrp: {
        type: 'numeric(12,2)',
        notNull: true,
        default: 0,
        check: 'mrp >= 0',
      },
      sale_price: {
        type: 'numeric(12,2)',
        notNull: true,
        default: 0,
        check: 'sale_price >= 0',
      },
      // Product-wise discount, stored as a percentage (PROJECT_SPEC.md §7).
      discount: {
        type: 'numeric(5,2)',
        notNull: true,
        default: 0,
        check: 'discount >= 0 AND discount <= 100',
      },
      // Bonus scheme (PROJECT_SPEC.md §8): "Scheme Enabled: Yes/No" plus
      // Purchase/Bonus quantity, e.g. 20 + 2.
      scheme_enabled: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      scheme_purchase_qty: {
        type: 'integer',
      },
      scheme_bonus_qty: {
        type: 'integer',
      },
      is_active: {
        type: 'boolean',
        notNull: true,
        default: true,
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
      updated_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    {
      constraints: {
        // When a scheme is enabled it must have a valid purchase/bonus
        // quantity (PROJECT_SPEC.md §26: purchase qty > 0, bonus qty >= 0).
        // When disabled, the quantities are irrelevant and left as-is.
        // NULL comparisons are neither true nor false in SQL, so a plain
        // `scheme_purchase_qty > 0` would silently pass when the column is
        // NULL. Require both to be explicitly non-null when enabled.
        check: [
          'NOT scheme_enabled OR (scheme_purchase_qty IS NOT NULL AND scheme_bonus_qty IS NOT NULL AND scheme_purchase_qty > 0 AND scheme_bonus_qty >= 0)',
        ],
      },
    }
  );

  // Product name/code/company are the documented search fields
  // (PROJECT_SPEC.md §5, §35).
  pgm.createIndex('products', 'name');
  pgm.createIndex('products', 'company');
  pgm.createIndex('products', 'is_active');

  pgm.createTrigger(
    'products',
    'set_products_updated_at',
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      level: 'ROW',
      language: 'plpgsql',
    },
    `
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    `
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('products');
  pgm.dropFunction('set_products_updated_at', []);
};
