import pg from "pg";

const globalForPg = globalThis as typeof globalThis & {
  __ledgerlyPool?: pg.Pool;
};

export function getPool(): pg.Pool {
  if (!globalForPg.__ledgerlyPool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    globalForPg.__ledgerlyPool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 8,
      idleTimeoutMillis: 0,
      keepAlive: true,
    });
  }
  return globalForPg.__ledgerlyPool;
}

let warming: Promise<void> | null = null;

/** Open a few connections now. The first handshake to the database is ~2s; later queries reuse it. */
export function warmPool(): Promise<void> {
  if (!warming) {
    const pool = getPool();
    warming = Promise.all([pool.query("SELECT 1"), pool.query("SELECT 1"), pool.query("SELECT 1")])
      .then(() => undefined)
      .catch((e) => {
        warming = null;
        console.warn("db warm:", e instanceof Error ? e.message : e);
      });
    // Neon sleeps after a few quiet minutes. A light ping keeps the next click under a second.
    const timer = setInterval(() => {
      pool.query("SELECT 1").catch(() => undefined);
    }, 4 * 60 * 1000);
    timer.unref?.();
  }
  return warming;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const res = await query<T>(text, params);
  return res.rows[0] ?? null;
}

export async function queryRows<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await query<T>(text, params);
  return res.rows;
}
