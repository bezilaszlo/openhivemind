import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { testDatabase, clearDatabase } from "./database";
import { createAuth } from "../src/auth/index";
import { mountAuth, authenticate, mintToken } from "../src/auth/bridge";
import { buildApp } from "../src/app";

const url = "http://localhost:3000";
const pool = testDatabase();
const auth = createAuth(pool, { url, secret: "integration-only-not-a-production-secret-0001" });
const app = await buildApp({
  handlers: {
    tokenCreate: async (request) =>
      mintToken(
        pool,
        await authenticate(pool, auth, request, url),
        (request.body as { name: string }).name,
      ),
  },
});
beforeAll(async () => {
  await mountAuth(app, pool, auth, url);
  await app.ready();
});
beforeEach(async () => {
  await clearDatabase(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
it("bootstraps exactly one org, requires invitations, and mints hashed PATs through Fastify", async () => {
  const register = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: {
      name: "First developer",
      email: "first@example.test",
      password: "integration-password-123",
    },
  });
  expect(register.statusCode, register.body).toBe(200);
  const cookies = register.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const members = await pool.query("SELECT role FROM auth.member");
  expect(members.rows).toEqual([{ role: "admin" }]);
  const rejected = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: {
      name: "Second developer",
      email: "second@example.test",
      password: "integration-password-123",
    },
  });
  expect(rejected.statusCode).toBe(403);
  const pat = await app.inject({
    method: "POST",
    url: "/api/v1/me/tokens",
    headers: { cookie: cookies, origin: url },
    payload: { name: "laptop" },
  });
  expect(pat.statusCode, pat.body).toBe(200);
  expect(pat.json().token).toMatch(/^ohm_[a-f0-9]{40}$/);
  const stored = await pool.query("SELECT token_sha256 FROM api_token");
  expect(stored.rows[0].token_sha256).not.toBe(pat.json().token);
  const csrf = await app.inject({
    method: "POST",
    url: "/api/v1/me/tokens",
    headers: { cookie: cookies, origin: "http://evil.test" },
    payload: { name: "bad" },
  });
  expect(csrf.statusCode).toBe(403);
});
