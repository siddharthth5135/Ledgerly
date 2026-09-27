import pg from "pg";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const id = (await c.query("select id from owners limit 1")).rows[0].id;
try {
  console.log(
    (await c.query(`select * from sp_collections_summary($1, 'monthly'::period_filter)`, [id]))
      .rows[0]
  );
} catch (e) {
  console.error(e.message);
}
await c.end();
