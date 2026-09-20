/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * A short line about the business ("Medicine Distribution", "Wholesale
 * Pharma Supplies"), printed under the company name at the top of every
 * order receipt. Captured at registration next to the company name and
 * editable in Settings, like the name itself.
 *
 * Optional: the receipt falls back to a neutral default when it is NULL, so
 * accounts created before this column existed print exactly as they did.
 * A blank-but-present value would defeat that fallback, so a value that
 * exists has to be a real line.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('users', {
    tagline: {
      type: 'varchar(150)',
      check: "tagline IS NULL OR btrim(tagline) <> ''",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('users', 'tagline');
};
