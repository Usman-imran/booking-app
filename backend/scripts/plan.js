import 'dotenv/config';
import pool from '../src/config/db.js';

// Manages an account's Pro subscription from the command line - how Pro is
// switched on after a booker pays (WhatsApp / bank transfer). There is no
// admin panel in the app (PROJECT_SPEC.md §1); this is the operator's tool.
//
//   npm run plan -- show   <username>
//   npm run plan -- grant  <username> [months=1]   extends Pro by N months
//   npm run plan -- revoke <username>              ends Pro now
//
// `grant` extends from whichever is later, now or the current end date, so
// renewing early never loses the days already paid for.

const [command, username, monthsArg] = process.argv.slice(2);

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run plan -- <show|grant|revoke> <username> [months]');
  process.exitCode = 1;
}

function describe(row) {
  const pro = row.pro_until && new Date(row.pro_until) > new Date();
  const until = row.pro_until ? new Date(row.pro_until).toISOString() : 'never';
  return `${row.username} (${row.name}, ${row.company_name ?? 'no company'}): ${pro ? 'PRO' : 'FREE'} - pro_until ${until}`;
}

async function main() {
  if (!['show', 'grant', 'revoke'].includes(command) || !username) return usage();

  let sql;
  let params = [username];
  if (command === 'show') {
    sql = 'SELECT username, name, company_name, pro_until FROM users WHERE username = $1';
  } else if (command === 'grant') {
    const months = monthsArg === undefined ? 1 : Number(monthsArg);
    if (!Number.isInteger(months) || months < 1 || months > 36) return usage('months must be a whole number from 1 to 36.');
    sql = `UPDATE users
              SET pro_until = GREATEST(COALESCE(pro_until, now()), now()) + make_interval(months => $2)
            WHERE username = $1
        RETURNING username, name, company_name, pro_until`;
    params = [username, months];
  } else {
    sql = `UPDATE users SET pro_until = now() WHERE username = $1
        RETURNING username, name, company_name, pro_until`;
  }

  const { rows } = await pool.query(sql, params);
  if (!rows[0]) return usage(`No account with username "${username}".`);
  console.log(describe(rows[0]));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
