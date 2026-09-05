import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createAuth } from "../src/auth/index";
import { mountAuth } from "../src/auth/bridge";
import { handlers } from "../src/services";
import { testDatabase, clearDatabase } from "./database";
import { validate, routes, type Chunk } from "@openhivemind/shared";
const pool = testDatabase(),
  url = "http://localhost:3000";
const auth = createAuth(pool, { url, secret: "integration-only-not-a-production-secret-0003" });
const app = await buildApp({ url, handlers: handlers(pool, auth, url) });
beforeAll(async () => {
  await mountAuth(app, pool, auth, url);
  await app.ready();
});
beforeEach(() => clearDatabase(pool));
afterAll(async () => {
  await app.close();
  await pool.end();
});
it("runs register, PAT, ingest, list, search, usage and purge over the real HTTP contract", async () => {
  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: {
      name: "Developer",
      email: "http@example.test",
      password: "integration-password-123",
    },
  });
  expect(registered.statusCode).toBe(200);
  const cookie = registered.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const token = await app.inject({
    method: "POST",
    url: routes.tokenCreate.path,
    headers: { cookie, origin: url },
    payload: { name: "laptop" },
  });
  expect(token.statusCode, token.body).toBe(200);
  const headers = {
    authorization: `Bearer ${validate(routes.tokenCreate.response, token.json()).token}`,
    "x-openhivemind-protocol": "1",
  };
  const now = new Date().toISOString();
  const payload: Chunk = {
    protocolVersion: 1,
    chunkId: "http-chunk",
    meta: {
      source: "codex",
      version: "fixture",
      remote: "github.com/example/http",
      cwd: "/projects/http",
      branch: "main",
      branches: ["main"],
      title: "HTTP fixture",
      started_at: now,
      completed: true,
      spawn_depth: 0,
      models: [],
    },
    messages: [
      {
        seq: 1,
        rev: 1,
        kind: "reply",
        text: "A searchable HTTP answer",
        ts: now,
        usage: { input: 10, output: 4, cache_read: 0, cache_creation: 0 },
      },
    ],
  };
  const ingested = await app.inject({
    method: "POST",
    url: "/api/v1/ingest/sessions/http-session",
    headers,
    payload,
  });
  expect(ingested.statusCode, ingested.body).toBe(202);
  validate(routes.ingest.response, ingested.json());
  const list = await app.inject({ url: routes.sessions.path, headers });
  expect(list.statusCode, list.body).toBe(200);
  const sessions = validate(routes.sessions.response, list.json());
  expect(sessions.items).toHaveLength(1);
  const found = await app.inject({
    method: "POST",
    url: routes.search.path,
    headers,
    payload: { query: "searchable" },
  });
  expect(found.statusCode, found.body).toBe(200);
  expect(validate(routes.search.response, found.json()).items).toHaveLength(1);
  const usage = await app.inject({ url: routes.usage.path, headers });
  expect(validate(routes.usage.response, usage.json()).totals?.output).toBe(4);
  const purged = await app.inject({
    method: "DELETE",
    url: "/api/v1/sessions/" + sessions.items[0]!.id,
    headers,
  });
  expect(purged.statusCode, purged.body).toBe(200);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/ingest/sessions/http-session",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(410);
});
