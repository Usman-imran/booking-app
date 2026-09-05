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

export default pool;
