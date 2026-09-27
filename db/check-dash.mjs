import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const owner = await c.query(`SELECT id FROM owners LIMIT 1`);
const id = owner.rows[0].id;
try {
  const r = await c.query(`SELECT * FROM sp_dashboard_overview($1,'monthly'::period_filter)`, [id]);
  console.log(JSON.stringify(r.rows[0], null, 2));
} catch (e) {
  console.error("SP ERROR", e.message);
}
await c.end();
