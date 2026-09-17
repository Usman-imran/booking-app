import 'dotenv/config';
import os from 'node:os';
import app from './app.js';
import pool from './config/db.js';

const PORT = process.env.PORT || 5000;

// Verifies the database is reachable before accepting requests. A wrong
// DATABASE_URL / password / stopped Postgres otherwise only shows up as a
// failed request later; this makes it the first line in the console.
async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connection OK');
  } catch (err) {
    console.error('Database connection FAILED — check DATABASE_URL / PG* in backend/.env');
    console.error(err.message);
    process.exit(1);
  }
}

await checkDatabase();

// First non-internal IPv4 address, so the console shows the URL a phone or
// emulator on the same network must use (localhost only works on this box).
function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    const match = addrs?.find((a) => a.family === 'IPv4' && !a.internal);
    if (match) return match.address;
  }
  return null;
}

// No host argument, so Node binds to all interfaces and the API is
// reachable from other devices on the LAN, not just this machine.
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  const lan = lanAddress();
  if (lan) console.log(`  LAN (mobile devices): http://${lan}:${PORT}/api`);
});
