import { inject } from "vitest";
import type pg from "pg";
import { database } from "../src/db/index";
export function testDatabase() {
  return database(inject("databaseUrl"));
}
export async function clearDatabase(pool: pg.Pool) {
  const result = await pool.query<{ current_database: string }>("SELECT current_database()");
  if (!/^openhivemind_test_[a-f0-9]{32}$/.test(result.rows[0]?.current_database ?? ""))
    throw new Error("Refusing to clear a database not created by the test harness");
  await pool.query("TRUNCATE auth.user,auth.organization,bootstrap,rate_limit CASCADE");
}
export async function withRollback<T>(
  pool: pg.Pool,
  run: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    return await run(connection);
  } finally {
    try {
      await connection.query("ROLLBACK");
    } finally {
      connection.release();
    }
  }
}
