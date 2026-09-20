import pg from 'pg';

const { Pool } = pg;

// Check if running in production to enable SSL
const isProduction = process.env.NODE_ENV === 'production';

// PostgreSQL connection pool.
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        ssl: isProduction ? { rejectUnauthorized: false } : false,
      }
);

// Idle connection error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle database connection:', err.message);
});

export default pool;