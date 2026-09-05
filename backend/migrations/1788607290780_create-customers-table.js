/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Customers (PROJECT_SPEC.md §4). Database foundation only — no API/UI yet.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('customers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(150)',
      notNull: true,
      check: "btrim(name) <> ''",
    },
    code: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
      check: "btrim(code) <> ''",
    },
    contact_person: {
      type: 'varchar(150)',
    },
    phone: {
      type: 'varchar(20)',
    },
    alternate_phone: {
      type: 'varchar(20)',
    },
    address: {
      type: 'text',
    },
    city_area: {
      type: 'varchar(100)',
    },
    customer_type: {
      type: 'varchar(50)',
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
  });

  // Customer name/code are the primary search fields (PROJECT_SPEC.md §25, §35).
  pgm.createIndex('customers', 'name');
  pgm.createIndex('customers', 'is_active');

  pgm.createTrigger(
    'customers',
    'set_customers_updated_at',
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
  pgm.dropTable('customers');
  pgm.dropFunction('set_customers_updated_at', []);
};
