import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { TestProject } from "vitest/node";
import { database, migrate } from "../src/db/index";
export default async function setup(project: TestProject) {
  const base = new URL(
    process.env.DATABASE_URL ?? "postgres://openhivemind:development@localhost:55432/postgres",
  );
  base.pathname = "/postgres";
  const admin = database(base.href);
  const name = "openhivemind_test_" + randomUUID().replaceAll("-", "");
  let created = false;
  async function cleanup() {
    try {
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    base.pathname = "/" + name;
    const pool = database(base.href);
    try {
      await migrate(pool, resolve("backend/src/db/migrations"));
    } finally {
      await pool.end();
    }
    project.provide("databaseUrl", base.href);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
