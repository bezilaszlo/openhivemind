import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createAuth } from "../src/auth/index";
import { mountAuth } from "../src/auth/bridge";
import { handlers } from "../src/services";
import { testDatabase, clearDatabase } from "./database";
import { validate, routes, type Chunk } from "@openhivemind/shared";
const pool = testDatabase(),
  url = "http://localhost:3000";
const auth = createAuth(pool, { url, secret: "integration-only-not-a-production-secret-0005" });
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
const now = new Date().toISOString();
function chunk(
  externalId: string,
  over: Partial<Chunk["meta"]> & { input?: number; output?: number } = {},
): Chunk {
  const { input = 100, output = 20, ...meta } = over;
  return {
    protocolVersion: 1,
    chunkId: "chunk-" + externalId,
    meta: {
      source: "claude-code",
      version: "fixture",
      remote: "github.com/example/agents",
      cwd: "/projects/agents",
      branch: "main",
      branches: ["main"],
      title: externalId,
      started_at: now,
      completed: true,
      spawn_depth: 0,
      models: ["claude-opus-5"],
      ...meta,
    },
    messages: [
      {
        seq: 1,
        rev: 1,
        kind: "reply",
        text: "work",
        ts: now,
        usage: { input, output, cache_read: 0, cache_creation: 0 },
      },
    ],
  };
}
it("rolls a session's subagents up into one summary and filters on their shape", async () => {
  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: { name: "Developer", email: "agents@example.test", password: "integration-pass-123" },
  });
  const cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");
  const token = await app.inject({
    method: "POST",
    url: routes.tokenCreate.path,
    headers: { cookie, origin: url },
    payload: { name: "laptop" },
  });
  const headers = {
    authorization: `Bearer ${validate(routes.tokenCreate.response, token.json()).token}`,
    "x-openhivemind-protocol": "1",
  };
  const ingest = async (externalId: string, over?: Parameters<typeof chunk>[1]) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ingest/sessions/" + externalId,
      headers,
      payload: chunk(externalId, over),
    });
    expect(response.statusCode, response.body).toBe(202);
  };
  await ingest("root");
  await ingest("alone");
  // The harness flattens nesting: every child hangs off the root and carries its depth.
  await ingest("child-a", { parent_external_id: "root", spawn_depth: 1 });
  await ingest("child-b", { parent_external_id: "root", spawn_depth: 1, input: 300, output: 40 });
  await ingest("child-c", {
    parent_external_id: "root",
    spawn_depth: 2,
    models: ["claude-haiku-5"],
    model_explicit: "claude-haiku-5",
  });
  const list = async (query = "") =>
    validate(
      routes.sessions.response,
      (await app.inject({ url: routes.sessions.path + query, headers })).json(),
    );
  const sessions = await list();
  expect(sessions.items.map((session) => session.title).sort()).toEqual(["alone", "root"]);
  const root = sessions.items.find((session) => session.title === "root")!;
  expect(root.agents).toEqual({
    count: 3,
    maxDepth: 2,
    models: [
      { model: "claude-opus-5", count: 2, inherited: 2 },
      { model: "claude-haiku-5", count: 1, inherited: 0 },
    ],
    inputTokens: 500,
    outputTokens: 80,
  });
  expect(sessions.items.find((session) => session.title === "alone")!.agents).toBeNull();
  expect((await list("?subagents=true")).items.map((session) => session.title)).toEqual(["root"]);
  expect((await list("?nested=true")).items.map((session) => session.title)).toEqual(["root"]);
  expect((await list("?inherited=true")).items.map((session) => session.title)).toEqual(["root"]);
  const children = await list("?parent=" + root.id + "&includeChildren=true");
  expect(children.items.map((session) => session.spawn_depth).sort()).toEqual([1, 1, 2]);
  const detail = validate(
    routes.session.response,
    (await app.inject({ url: "/api/v1/sessions/" + root.id, headers })).json(),
  );
  expect(detail.session.agents?.count).toBe(3);
});
