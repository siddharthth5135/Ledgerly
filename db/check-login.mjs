import bcrypt from "bcryptjs";
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  "SELECT email, password_hash FROM users WHERE email=$1",
  ["owner@demopackers.in"]
);
const hash = r.rows[0]?.password_hash;
console.log("hash_prefix", hash?.slice(0, 7));
console.log("verify", await bcrypt.compare("Password@123", hash));
await c.end();
