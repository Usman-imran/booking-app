import 'dotenv/config';
import pool from './db.js';

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS now, current_database() AS database');
    console.log('Database connection successful.');
    console.log(`  Database: ${result.rows[0].database}`);
    console.log(`  Server time: ${result.rows[0].now}`);
    process.exit(0);
  } catch (err) {
    console.error('Database connection failed.');
    console.error(`  ${err.message || err.code || err}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();
