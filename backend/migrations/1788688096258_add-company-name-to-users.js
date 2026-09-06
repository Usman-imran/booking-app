/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * The distribution business a booker works for, captured at registration and
 * used to brand the application — the sidebar header and the printed order
 * receipt both carry it instead of a generic product name.
 *
 * Nullable at the database level even though registration requires it: users
 * created before this column existed have no value to backfill with, and
 * inventing one would put a wrong company name on their receipts. The UI
 * falls back to "Medicine Distribution" when it is missing, so a NULL is a
 * safe, visible state rather than a broken one.
 *
 * Not to be confused with `products.company`, which is a medicine's
 * MANUFACTURER (PROJECT_SPEC.md §5). This is the distributor using the app.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('users', {
    company_name: {
      type: 'varchar(150)',
      // Blank-but-present would defeat the fallback, so a value that exists
      // has to be a real name.
      check: "company_name IS NULL OR btrim(company_name) <> ''",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('users', 'company_name');
};
