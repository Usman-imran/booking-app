import pg from 'pg';

const { Pool } = pg;

// PostgreSQL connection pool. Not connected eagerly at startup so the
// backend can run even before a database is provisioned. Business
// modules (Stage 3+) will import this pool to run queries.
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }
);

// An idle pooled connection can be dropped by the server (Postgres
// restart, network blip). Without a listener that surfaces as an unhandled
// 'error' event, which crashes the whole process — and every request from
// then on fails in the browser as "Failed to fetch". Log it instead; the
// pool replaces the connection on the next query.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database connection:', err.message);
});

export default pool;
