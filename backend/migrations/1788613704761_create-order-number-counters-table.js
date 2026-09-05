/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * Backing store for the concurrency-safe ORD-YYYYMMDD-XXX order numbering
 * system (PROJECT_SPEC.md §11). One row per calendar day; the sequence for
 * a day is claimed via an atomic UPSERT (see backend/src/utils/orderNumber.js),
 * so the daily reset falls out naturally from a fresh row per date, and the
 * whole DB's own `CURRENT_DATE` decides what day it is (no app-side timezone
 * math).
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('order_number_counters', {
    counter_date: {
      type: 'date',
      primaryKey: true,
    },
    last_sequence: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'last_sequence >= 0',
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('order_number_counters');
};
