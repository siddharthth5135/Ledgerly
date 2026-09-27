/**
 * Runs ledgerly/db SQL install against DATABASE_URL (Neon / Postgres).
 * Usage: node --env-file=.env.local db/run-install.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const files = [
  "migrations/001_extensions.sql",
  "migrations/002_enums.sql",
  "migrations/003_tables.sql",
  "migrations/004_triggers_helpers.sql",
  "migrations/006_business_profile.sql",
  "procedures/01_auth.sql",
  "procedures/02_customers.sql",
  "procedures/03_invoices.sql",
  "procedures/04_templates.sql",
  "procedures/05_collections.sql",
  "procedures/06_dashboard.sql",`n  "migrations/007_dashboard_analytics.sql",
  "migrations/008_money_features.sql",
  "migrations/005_seed_demo.sql",
  "queries/00_verify_install.sql",
];

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to Neon.");

try {
  for (const rel of files) {
    const full = path.join(root, rel);
    const sql = fs.readFileSync(full, "utf8");
    console.log(`\n>>> ${rel}`);
    const res = await client.query(sql);
    if (Array.isArray(res)) {
      for (const r of res) {
        if (r.rows?.length) console.table(r.rows);
      }
    } else if (res.rows?.length) {
      console.table(res.rows);
    } else {
      console.log("OK");
    }
  }
  console.log("\n=== INSTALL COMPLETE ===");
} catch (err) {
  console.error("\nFAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
