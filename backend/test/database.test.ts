import { afterAll, beforeEach, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { seed } from "drizzle-seed";
import { user } from "../src/db/schema";
import { testDatabase, clearDatabase, withRollback } from "./database";
const pool = testDatabase();
beforeEach(() => clearDatabase(pool));
afterAll(() => pool.end());
it("seeds schema-typed data and rolls it back on success", async () => {
  await withRollback(pool, async (connection) => {
    await seed(drizzle(connection), { user }, { count: 2, seed: 42 }).refine((generators) => ({
      user: {
        columns: {
          name: generators.fullName(),
          email: generators.email(),
          emailVerified: generators.default({ defaultValue: false }),
        },
      },
    }));
    expect((await connection.query("SELECT id FROM auth.user")).rowCount).toBe(2);
  });
  expect((await pool.query("SELECT id FROM auth.user")).rowCount).toBe(0);
});
it("rolls back on failure and returns the connection", async () => {
  await expect(
    withRollback(pool, async (connection) => {
      await seed(drizzle(connection), { user }, { count: 1, seed: 43 });
      throw new Error("test failure");
    }),
  ).rejects.toThrow("test failure");
  expect((await pool.query("SELECT id FROM auth.user")).rowCount).toBe(0);
});
