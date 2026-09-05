/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Users/Bookers (PROJECT_SPEC.md §2). Login and role/permission APIs are
 * built in a later step — this is the schema foundation only.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('users', {
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
    username: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
      check: "btrim(username) <> ''",
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    phone: {
      type: 'varchar(20)',
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

  pgm.createIndex('users', 'is_active');

  // Keeps updated_at current on every row update, without relying on
  // application code to remember to set it.
  pgm.createTrigger(
    'users',
    'set_users_updated_at',
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
  pgm.dropTable('users');
  pgm.dropFunction('set_users_updated_at', []);
};
