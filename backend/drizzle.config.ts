import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  schemaFilter: ["public", "auth"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/openhivemind" },
});
