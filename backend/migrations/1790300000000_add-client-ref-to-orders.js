/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * An idempotency key for order creation.
 *
 * The mobile app books orders offline and replays them when the connection
 * returns. On a weak signal a POST can reach the server and commit while the
 * response is lost on the way back; the app then retries, and without a key
 * the same order would be booked twice (each copy with its own order number).
 *
 * The app generates a UUID per order when the booker taps save and sends it
 * as `clientRef` on every attempt. A second POST carrying a ref that already
 * exists returns the original order instead of creating another.
 *
 * Unique per booker, like every other per-user rule (see add-owner-scoping).
 * Nullable: the web client and older app builds don't send one, and orders
 * created before this column existed have none.
 *
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumn('orders', { client_ref: { type: 'uuid' } });
  pgm.addConstraint('orders', 'orders_booker_client_ref_key', { unique: ['booker_id', 'client_ref'] });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropConstraint('orders', 'orders_booker_client_ref_key');
  pgm.dropColumn('orders', 'client_ref');
};
