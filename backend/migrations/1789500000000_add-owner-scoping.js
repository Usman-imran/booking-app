/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Per-user data scoping.
 *
 * Registration is open to the public, so every account is its own isolated
 * workspace: a user's customers, products, orders and targets are visible to
 * that user alone. This adds the ownership column each of those tables is
 * scoped by, and re-keys every uniqueness rule so it holds PER OWNER rather
 * than across the whole table — two users may each have a customer coded
 * "C-001" or an order numbered ORD-20260915-001 without colliding.
 *
 * Orders already carry `booker_id` (NOT NULL, references users), which is
 * exactly their owner, so no new column is added there. `order_items` are
 * scoped through their order.
 *
 * Existing rows are assigned to the earliest-created account: before this
 * migration there was one business per installation, so everything in the
 * database belongs to whoever set it up.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  const ownerColumn = {
    type: 'uuid',
    references: 'users',
    onDelete: 'RESTRICT',
  };

  // The account every pre-existing row is handed to.
  const FIRST_USER = '(SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1)';

  for (const table of ['customers', 'products', 'monthly_targets', 'order_number_counters']) {
    pgm.addColumn(table, { owner_id: ownerColumn });
    pgm.sql(`UPDATE ${table} SET owner_id = ${FIRST_USER} WHERE owner_id IS NULL`);
    // Fails loudly if rows exist but no user does to hand them to — better
    // than silently leaving orphaned data that nobody can see.
    pgm.alterColumn(table, 'owner_id', { notNull: true });
  }

  // Customer and product codes are unique within one user's data.
  pgm.dropConstraint('customers', 'customers_code_key');
  pgm.addConstraint('customers', 'customers_owner_code_key', { unique: ['owner_id', 'code'] });
  pgm.createIndex('customers', 'owner_id');

  pgm.dropConstraint('products', 'products_code_key');
  pgm.addConstraint('products', 'products_owner_code_key', { unique: ['owner_id', 'code'] });
  pgm.createIndex('products', 'owner_id');

  // Order numbers run per user — each account has its own daily
  // ORD-YYYYMMDD-XXX sequence, so the counter is keyed by owner and day.
  pgm.dropConstraint('orders', 'orders_order_number_key');
  pgm.addConstraint('orders', 'orders_booker_order_number_key', { unique: ['booker_id', 'order_number'] });

  pgm.dropConstraint('order_number_counters', 'order_number_counters_pkey');
  pgm.addConstraint('order_number_counters', 'order_number_counters_pkey', {
    primaryKey: ['owner_id', 'counter_date'],
  });

  // One target per month per scope, per user.
  pgm.dropIndex('monthly_targets', [], { name: 'monthly_targets_period_scope_unique' });
  pgm.createIndex('monthly_targets', ['owner_id', 'year', 'month', "lower(coalesce(company, ''))"], {
    name: 'monthly_targets_period_scope_unique',
    unique: true,
  });
  pgm.createIndex('monthly_targets', 'owner_id');
};

/**
 * Reverses the scoping. Only safe while the per-owner uniqueness rules
 * would also hold globally (e.g. a single user's data); with several users
 * sharing a code or order number the constraint re-creation will fail,
 * which is the correct outcome — the data cannot be merged automatically.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropIndex('monthly_targets', 'owner_id');
  pgm.dropIndex('monthly_targets', [], { name: 'monthly_targets_period_scope_unique' });
  pgm.createIndex('monthly_targets', ['year', 'month', "lower(coalesce(company, ''))"], {
    name: 'monthly_targets_period_scope_unique',
    unique: true,
  });

  pgm.dropConstraint('order_number_counters', 'order_number_counters_pkey');
  pgm.addConstraint('order_number_counters', 'order_number_counters_pkey', { primaryKey: 'counter_date' });

  pgm.dropConstraint('orders', 'orders_booker_order_number_key');
  pgm.addConstraint('orders', 'orders_order_number_key', { unique: 'order_number' });

  pgm.dropIndex('products', 'owner_id');
  pgm.dropConstraint('products', 'products_owner_code_key');
  pgm.addConstraint('products', 'products_code_key', { unique: 'code' });

  pgm.dropIndex('customers', 'owner_id');
  pgm.dropConstraint('customers', 'customers_owner_code_key');
  pgm.addConstraint('customers', 'customers_code_key', { unique: 'code' });

  for (const table of ['order_number_counters', 'monthly_targets', 'products', 'customers']) {
    pgm.dropColumn(table, 'owner_id');
  }
};
