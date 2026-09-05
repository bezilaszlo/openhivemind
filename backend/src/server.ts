import { resolve, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import staticFiles from "@fastify/static";
import { buildApp } from "./app";
import { database, migrate, verifyMigrations } from "./db/index";
import { createAuth } from "./auth/index";
import { mountAuth } from "./auth/bridge";
const url = process.env.APP_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = database(databaseUrl);
const migrations = resolve(import.meta.dirname, "../src/db/migrations");
if (process.argv[2] === "migrate") {
  try {
    await migrate(pool, migrations);
  } finally {
    await pool.end();
  }
} else {
  await verifyMigrations(pool, migrations);
  let secret = process.env.AUTH_SECRET;
  if (!secret) {
    const folder =
      process.env.SERVER_STATE_DIR ?? join(homedir(), ".local/state/openhivemind/server");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const path = join(folder, "auth-secret");
    try {
      await writeFile(path, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    }
    secret = await readFile(path, "utf8");
  }
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  const app = await buildApp({ url });
  const auth = createAuth(pool, { url, secret });
  await mountAuth(app, pool, auth, url);
  await app.register(staticFiles, { root: resolve(import.meta.dirname, "../../frontend/dist") });
  app.get("/health/ready", async () => {
    await pool.query("SELECT 1");
    return { ok: true };
  });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      void app.close();
    });
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
