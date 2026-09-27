/**
 * Runs a single SQL file against DATABASE_URL.
 * Usage: node --env-file=.env.local db/run-migration.mjs migrations/006_business_profile.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const rel = process.argv[2];
if (!rel) {
  console.error("Usage: node --env-file=.env.local db/run-migration.mjs <file.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const full = path.join(path.dirname(fileURLToPath(import.meta.url)), rel);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(fs.readFileSync(full, "utf8"));
  console.log(`OK ${rel}`);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
