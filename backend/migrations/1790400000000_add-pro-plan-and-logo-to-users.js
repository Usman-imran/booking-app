/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * The freemium plan and the Pro-only receipt logo.
 *
 * `pro_until` is when the account's Pro subscription runs out; the account
 * is Pro while it lies in the future and Free otherwise (null = never paid).
 * A date rather than a flag, so a monthly subscription lapses on its own
 * without anyone having to switch it off. It is set by the operator
 * (scripts/plan.js) after a payment - there is no in-app admin panel.
 *
 * `logo` is the business's logo as a small data URI (the app resizes it to
 * 256px before upload), printed at the top of receipts while the account is
 * Pro. Kept on `users` like the company name and tagline it sits next to;
 * the CHECK bounds its size so one row can't grow without limit.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('users', {
    pro_until: { type: 'timestamptz' },
    logo: {
      type: 'text',
      check: "logo IS NULL OR (logo LIKE 'data:image/%' AND length(logo) <= 300000)",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumn('users', ['pro_until', 'logo']);
};
