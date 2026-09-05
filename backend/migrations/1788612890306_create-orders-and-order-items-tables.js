/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Orders + Order Items (PROJECT_SPEC.md §10-§17, §26, §34). Database
 * foundation and historical-snapshot columns only — no API/UI yet.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable(
    'orders',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      // Assigned only on submission (PROJECT_SPEC.md §11/§13): format
      // ORD-YYYYMMDD-XXX, unique, sequence resets daily. Generation itself
      // (concurrency-safe) is built in a later step; this is schema only.
      order_number: {
        type: 'varchar(20)',
        unique: true,
      },
      customer_id: {
        type: 'uuid',
        notNull: true,
        references: 'customers',
        onDelete: 'RESTRICT',
      },
      // The booker/user who created the order (PROJECT_SPEC.md §2, §10).
      booker_id: {
        type: 'uuid',
        notNull: true,
        references: 'users',
        onDelete: 'RESTRICT',
      },
      status: {
        type: 'varchar(20)',
        notNull: true,
        default: 'draft',
        check: "status IN ('draft', 'submitted', 'cancelled')",
      },
      remarks: {
        type: 'text',
      },
      subtotal: {
        type: 'numeric(14,2)',
        notNull: true,
        default: 0,
        check: 'subtotal >= 0',
      },
      discount_total: {
        type: 'numeric(14,2)',
        notNull: true,
        default: 0,
        check: 'discount_total >= 0',
      },
      total: {
        type: 'numeric(14,2)',
        notNull: true,
        default: 0,
        check: 'total >= 0',
      },
      submitted_at: {
        type: 'timestamptz',
      },
      cancelled_at: {
        type: 'timestamptz',
      },
      cancelled_by: {
        type: 'uuid',
        references: 'users',
        onDelete: 'RESTRICT',
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
        check: [
          // Order-total identity: subtotal minus discounts equals the total.
          'total = subtotal - discount_total',
          // Format enforced only when present (NULL while still a draft).
          "order_number IS NULL OR order_number ~ '^ORD-[0-9]{8}-[0-9]{3}$'",
          // A draft has no order number yet; submitted/cancelled must have one.
          "(status = 'draft' AND order_number IS NULL) OR (status IN ('submitted', 'cancelled') AND order_number IS NOT NULL)",
          // Status/timestamp state machine (PROJECT_SPEC.md §12): exactly
          // one of these three states holds at any time.
          `(status = 'draft' AND submitted_at IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL)
           OR (status = 'submitted' AND submitted_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by IS NULL)
           OR (status = 'cancelled' AND submitted_at IS NOT NULL AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)`,
        ],
      },
    }
  );

  pgm.createIndex('orders', 'customer_id');
  pgm.createIndex('orders', 'booker_id');
  pgm.createIndex('orders', 'status');

  pgm.createTrigger(
    'orders',
    'set_orders_updated_at',
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

  pgm.createTable(
    'order_items',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      order_id: {
        type: 'uuid',
        notNull: true,
        references: 'orders',
        onDelete: 'CASCADE',
      },
      // Products are never hard-deleted (only deactivated), so historical
      // items always keep a valid reference even after that.
      product_id: {
        type: 'uuid',
        notNull: true,
        references: 'products',
        onDelete: 'RESTRICT',
      },

      // --- Historical snapshot: copied from the product at order time and
      // never updated afterwards, even if the product later changes
      // (PROJECT_SPEC.md §6, §7, §8, §16). ---
      product_name: {
        type: 'varchar(200)',
        notNull: true,
      },
      product_code: {
        type: 'varchar(50)',
        notNull: true,
      },
      mrp: {
        type: 'numeric(12,2)',
        notNull: true,
        check: 'mrp >= 0',
      },
      rate: {
        type: 'numeric(12,2)',
        notNull: true,
        check: 'rate >= 0',
      },
      discount: {
        type: 'numeric(5,2)',
        notNull: true,
        default: 0,
        check: 'discount >= 0 AND discount <= 100',
      },
      paid_qty: {
        type: 'integer',
        notNull: true,
        check: 'paid_qty > 0',
      },
      // Automatically calculated from the scheme snapshot below
      // (PROJECT_SPEC.md §9); has zero sales value.
      bonus_qty: {
        type: 'integer',
        notNull: true,
        default: 0,
        check: 'bonus_qty >= 0',
      },
      scheme_purchase_qty: {
        type: 'integer',
      },
      scheme_bonus_qty: {
        type: 'integer',
      },

      // --- Computed at order time from the values above; stored so later
      // product/price/discount/scheme changes can never alter history. ---
      line_subtotal: {
        type: 'numeric(14,2)',
        notNull: true,
        check: 'line_subtotal >= 0',
      },
      line_discount: {
        type: 'numeric(14,2)',
        notNull: true,
        default: 0,
        check: 'line_discount >= 0',
      },
      line_total: {
        type: 'numeric(14,2)',
        notNull: true,
        check: 'line_total >= 0',
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
        check: [
          // A scheme snapshot is either fully present or fully absent.
          '(scheme_purchase_qty IS NULL) = (scheme_bonus_qty IS NULL)',
          // Line-total identity, mirroring the order-level one above.
          'line_total = line_subtotal - line_discount',
        ],
      },
    }
  );

  pgm.createIndex('order_items', 'order_id');
  pgm.createIndex('order_items', 'product_id');

  pgm.createTrigger(
    'order_items',
    'set_order_items_updated_at',
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
  pgm.dropTable('order_items');
  pgm.dropFunction('set_order_items_updated_at', []);
  pgm.dropTable('orders');
  pgm.dropFunction('set_orders_updated_at', []);
};
