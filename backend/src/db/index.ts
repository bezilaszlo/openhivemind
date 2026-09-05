import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
export function database(url: string) {
  return new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 });
}
export async function migrate(pool: pg.Pool, folder: string) {
  const connection = await pool.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(726141)");
    await drizzleMigrate(drizzle(connection), { migrationsFolder: folder });
  } finally {
    await connection.query("SELECT pg_advisory_unlock(726141)");
    connection.release();
  }
}
export async function verifyMigrations(pool: pg.Pool, folder: string) {
  const journal = JSON.parse(await readFile(join(folder, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  const applied = await pool.query<{ hash: string }>(
    "SELECT hash FROM drizzle.__drizzle_migrations",
  );
  const hashes = new Set(applied.rows.map((row) => row.hash));
  for (const entry of journal.entries) {
    const hash = createHash("sha256")
      .update(await readFile(join(folder, entry.tag + ".sql")))
      .digest("hex");
    if (!hashes.has(hash))
      throw new Error("Pending or changed migration; run migrate before serving");
  }
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
