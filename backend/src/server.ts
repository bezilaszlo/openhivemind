import { resolve } from "node:path";
import { existsSync } from "node:fs";
import staticFiles from "@fastify/static";
import { buildApp } from "./app";
import { database, migrate, verifyMigrations } from "./db/index";
import { createAuth } from "./auth/index";
import { loadSecret } from "./auth/secret";
import { mountAuth } from "./auth/bridge";
import { handlers } from "./services";
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
  const secret = process.env.AUTH_SECRET || (await loadSecret());
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  const auth = createAuth(pool, {
    url,
    secret,
    ...(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET
      ? {
          oidc: {
            issuer: process.env.OIDC_ISSUER,
            clientId: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
          },
        }
      : {}),
  });
  const app = await buildApp({
    url,
    handlers: handlers(pool, auth, url, Number(process.env.RETENTION_DAYS ?? 90)),
  });
  await mountAuth(app, pool, auth, url);
  // The dev stack serves the viewer from Vite, so a missing build is not an error there.
  const viewer = resolve(import.meta.dirname, "../../frontend/dist");
  if (existsSync(viewer)) await app.register(staticFiles, { root: viewer });
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
