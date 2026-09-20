/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * A product may now carry SEVERAL bonus schemes instead of one — the
 * tiered offers manufacturers actually print ("10 + 1, 50 + 6, 100 + 15").
 * They live in one JSONB array, `bonus_schemes`, as
 * `[{ "purchaseQty": 10, "bonusQty": 1 }, ...]` ordered by purchase
 * quantity, and a product with no scheme simply has `[]`.
 *
 * A JSONB column rather than a child table because every reader of a
 * product wants its schemes at the same time (the list, the order screen,
 * the receipt), and a child table would turn each of those into a join or
 * an N+1 (PROJECT_SPEC.md §35). The array is small and bounded, and the
 * API validates its shape before anything reaches the database.
 *
 * The old single-scheme columns are folded into the array and dropped:
 * keeping both would leave two sources of truth to drift apart. The
 * `order_items` snapshot columns are untouched — an order line still
 * records the ONE tier that applied to its quantity.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('products', {
    bonus_schemes: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
      check: "jsonb_typeof(bonus_schemes) = 'array'",
    },
  });

  // An enabled scheme becomes a one-tier array; a disabled one stays [].
  // The old table-level check guarantees an enabled scheme has both
  // quantities, so nothing here can produce a half-formed tier.
  pgm.sql(`
    UPDATE products
    SET bonus_schemes = jsonb_build_array(
      jsonb_build_object('purchaseQty', scheme_purchase_qty, 'bonusQty', scheme_bonus_qty)
    )
    WHERE scheme_enabled = true
  `);

  pgm.dropConstraint('products', 'products_chck_1');
  pgm.dropColumn('products', ['scheme_enabled', 'scheme_purchase_qty', 'scheme_bonus_qty']);
};

/**
 * Rolling back keeps only the FIRST (lowest) tier of each product, since
 * the old columns can hold exactly one.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.addColumn('products', {
    scheme_enabled: { type: 'boolean', notNull: true, default: false },
    scheme_purchase_qty: { type: 'integer' },
    scheme_bonus_qty: { type: 'integer' },
  });

  pgm.sql(`
    UPDATE products
    SET scheme_enabled = true,
        scheme_purchase_qty = (bonus_schemes -> 0 ->> 'purchaseQty')::integer,
        scheme_bonus_qty = (bonus_schemes -> 0 ->> 'bonusQty')::integer
    WHERE jsonb_array_length(bonus_schemes) > 0
  `);

  pgm.addConstraint('products', 'products_chck_1', {
    check:
      'NOT scheme_enabled OR (scheme_purchase_qty IS NOT NULL AND scheme_bonus_qty IS NOT NULL AND scheme_purchase_qty > 0 AND scheme_bonus_qty >= 0)',
  });

  pgm.dropColumn('products', 'bonus_schemes');
};
