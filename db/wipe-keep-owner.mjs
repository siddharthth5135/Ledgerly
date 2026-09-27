/**
 * Wipe all app data except one owner login.
 * Usage: node --env-file=.env.local db/wipe-keep-owner.mjs [email]
 * Default keep email: owner@demopackers.in
 */
import pg from "pg";

const keepEmail = (process.argv[2] || "owner@demopackers.in").toLowerCase().trim();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const keep = await client.query(
  `SELECT u.id AS user_id, u.owner_id, u.email, u.role, o.business_name
   FROM users u
   JOIN owners o ON o.id = u.owner_id
   WHERE lower(u.email) = $1 AND u.role = 'owner'
   LIMIT 1`,
  [keepEmail]
);

if (!keep.rows.length) {
  console.error(`No owner user found for email: ${keepEmail}`);
  await client.end();
  process.exit(1);
}

const { user_id, owner_id, email, business_name } = keep.rows[0];
console.log(`Keeping login: ${email} (${business_name})`);
console.log(`user_id=${user_id}`);
console.log(`owner_id=${owner_id}`);

await client.query("BEGIN");
try {
  // Child data for keep-owner (and any others)
  const counts = {};

  const del = async (sql, params = []) => {
    const r = await client.query(sql, params);
    return r.rowCount ?? 0;
  };

  counts.reminders = await del(`DELETE FROM reminders`);
  counts.invoice_lines = await del(`DELETE FROM invoice_lines`);
  counts.invoices = await del(`DELETE FROM invoices`);
  counts.bill_templates = await del(`DELETE FROM bill_templates`);
  counts.customers = await del(`DELETE FROM customers`);
  counts.catalog_items = await del(`DELETE FROM catalog_items`);
  counts.password_otps = await del(`DELETE FROM password_otps`);
  counts.audit_logs = await del(`DELETE FROM audit_logs`);

  // Staff + other users (keep only this owner user)
  counts.other_users = await del(`DELETE FROM users WHERE id <> $1`, [user_id]);

  // Other owners (CASCADE would wipe keep user if we deleted keep owner — don't)
  counts.other_owners = await del(`DELETE FROM owners WHERE id <> $1`, [owner_id]);

  await client.query("COMMIT");
  console.log("Wiped:", counts);

  const verify = await client.query(`
    SELECT
      (SELECT count(*)::int FROM owners) AS owners,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM customers) AS customers,
      (SELECT count(*)::int FROM invoices) AS invoices,
      (SELECT count(*)::int FROM bill_templates) AS templates,
      (SELECT count(*)::int FROM reminders) AS reminders,
      (SELECT count(*)::int FROM catalog_items) AS catalog,
      (SELECT count(*)::int FROM password_otps) AS otps,
      (SELECT count(*)::int FROM audit_logs) AS audits
  `);
  console.log("Remaining counts:", verify.rows[0]);
  console.log(`Login still works: ${email} / Password@123 (if demo seed)`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Wipe failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
