/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Monthly targets (PROJECT_SPEC.md §19), with the approved company-wise
 * extension: a target is either the month's OVERALL target, or a target for
 * one manufacturer within that month.
 *
 * `company` NULL means the overall target — the whole month's sales,
 * whatever the manufacturer. A non-NULL `company` narrows the target to the
 * products of that manufacturer. There is deliberately still no booker or
 * area target (§19, §20).
 *
 * `company` is free text matched against `products.company`, not a foreign
 * key: manufacturers aren't an entity in this application (§5 lists Company
 * as a product field, and §21/§27 warn against inventing tables), so there
 * is nothing to reference.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable(
    'monthly_targets',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      year: {
        type: 'integer',
        notNull: true,
        check: 'year BETWEEN 2000 AND 2100',
      },
      month: {
        type: 'integer',
        notNull: true,
        check: 'month BETWEEN 1 AND 12',
      },
      // NULL = the month's overall target; a value = that manufacturer's.
      company: {
        type: 'varchar(150)',
      },
      target_amount: {
        type: 'numeric(14,2)',
        notNull: true,
        default: 0,
        check: 'target_amount >= 0',
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
          // A company target is for a real manufacturer, not blank space.
          "company IS NULL OR btrim(company) <> ''",
        ],
      },
    }
  );

  // One target per month per scope. Two things a plain UNIQUE(year, month,
  // company) would not give us:
  //   * NULLs compare as distinct in SQL, so it would happily allow several
  //     "overall" targets for the same month. COALESCE folds NULL into a
  //     single sentinel value so the overall target is unique too.
  //   * Manufacturer names are typed by hand, so 'GSK' and 'gsk' must not
  //     become two separate targets that each claim the same sales.
  pgm.createIndex('monthly_targets', ['year', 'month', "lower(coalesce(company, ''))"], {
    name: 'monthly_targets_period_scope_unique',
    unique: true,
  });

  // Progress is always read for a given month.
  pgm.createIndex('monthly_targets', ['year', 'month']);

  pgm.createTrigger(
    'monthly_targets',
    'set_monthly_targets_updated_at',
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
  pgm.dropTable('monthly_targets');
  pgm.dropFunction('set_monthly_targets_updated_at', []);
};
