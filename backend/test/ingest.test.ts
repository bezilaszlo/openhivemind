import { beforeEach, afterAll, expect, it } from "vitest";
import { seed } from "drizzle-seed";
import { drizzle } from "drizzle-orm/node-postgres";
import { organization, user, member } from "../src/db/schema";
import { testDatabase, clearDatabase } from "./database";
import { ingest, purge } from "../src/ingest";
import type { Context } from "../src/auth/bridge";
import type { Chunk } from "@openhivemind/shared";
const pool = testDatabase();
const owner: Context = {
  orgId: "team",
  userId: "owner",
  role: "member",
  scopes: ["ingest", "read"],
};
beforeEach(async () => {
  await clearDatabase(pool);
  await seed(drizzle(pool), { organization, user, member }, { count: 1, seed: 17 }).refine((f) => ({
    organization: {
      columns: {
        id: f.default({ defaultValue: "team" }),
        slug: f.default({ defaultValue: "team" }),
      },
    },
    user: { columns: { id: f.default({ defaultValue: "owner" }) } },
    member: { columns: { role: f.default({ defaultValue: "member" }) } },
  }));
});
afterAll(() => pool.end());
function chunk(): Chunk {
  const now = new Date().toISOString();
  return {
    protocolVersion: 1,
    chunkId: "chunk-1",
    meta: {
      source: "claude-code",
      version: "fixture",
      remote: "github.com/example/project",
      cwd: "/projects/example",
      branch: "main",
      branches: ["main"],
      title: "Test",
      started_at: now,
      completed: false,
      spawn_depth: 0,
      models: [],
    },
    messages: [
      {
        seq: 1,
        rev: 1,
        kind: "reply",
        text: "A searchable answer",
        ts: now,
        usage: { input: 10, output: 5, cache_read: 0, cache_creation: 0 },
      },
    ],
  };
}
it("replays idempotently, replaces higher revisions and rejects conflicting content atomically", async () => {
  const payload = chunk();
  expect((await ingest(pool, owner, "external", payload)).committedThrough).toBe(1);
  await ingest(pool, owner, "external", payload);
  expect((await pool.query("SELECT * FROM agent_message")).rowCount).toBe(1);
  expect((await pool.query("SELECT * FROM change")).rowCount).toBe(1);
  const message = payload.messages[0]!;
  message.text = "Different answer";
  await expect(ingest(pool, owner, "external", payload)).rejects.toThrow("Same revision");
  message.rev = 2;
  message.usage!.output = 8;
  await ingest(pool, owner, "external", payload);
  expect((await pool.query("SELECT data FROM agent_message")).rows[0].data.usage.output).toBe(8);
  message.rev = 1;
  await ingest(pool, owner, "external", payload);
  expect((await pool.query("SELECT rev FROM agent_message")).rows[0].rev).toBe(2);
});
it("links children arriving first and tombstones descendants against late retry", async () => {
  const child = chunk();
  child.meta.parent_external_id = "parent";
  await ingest(pool, owner, "child", child);
  await ingest(pool, owner, "parent", chunk());
  const parent = (await pool.query("SELECT id FROM agent_session WHERE external_id='parent'"))
    .rows[0].id;
  expect(
    (await pool.query("SELECT parent_session_id FROM agent_session WHERE external_id='child'"))
      .rows[0].parent_session_id,
  ).toBe(parent);
  expect(await purge(pool, owner, parent)).toEqual({ deleted: 2 });
  await expect(ingest(pool, owner, "child", child)).rejects.toThrow("purged");
});
it("rejects another owner and never resolves another tenant prefix", async () => {
  await ingest(pool, owner, "external", chunk());
  const id = (await pool.query("SELECT id FROM agent_session")).rows[0].id;
  await expect(ingest(pool, { ...owner, userId: "other" }, "external", chunk())).rejects.toThrow(
    "another developer",
  );
  await expect(purge(pool, { ...owner, userId: "other" }, id)).rejects.toThrow("Only the owner");
  await expect(purge(pool, { ...owner, orgId: "other-team" }, id)).rejects.toThrow("not found");
});
it("does not advance contiguous acknowledgement past a gap", async () => {
  const payload = chunk();
  payload.messages[0]!.seq = 2;
  expect((await ingest(pool, owner, "external", payload)).committedThrough).toBe(0);
});
it("rejects parent cycles and expired historic ingest", async () => {
  const payload = chunk();
  payload.meta.parent_external_id = "external";
  await expect(ingest(pool, owner, "external", payload)).rejects.toThrow("cycle");
  expect((await pool.query("SELECT id FROM agent_session")).rowCount).toBe(0);
  delete payload.meta.parent_external_id;
  payload.meta.started_at = "2020-01-01T00:00:00Z";
  payload.messages[0]!.ts = payload.meta.started_at;
  await expect(ingest(pool, owner, "external", payload)).rejects.toThrow("retention");
});

it("searches Boolean expressions and regex with tenant-scoped results and current-revision usage", async () => {
  const { search, sessionDetail, sessions, usage } = await import("../src/read");
  const payload = chunk();
  payload.messages[0]!.text = "alpha beta running";
  await ingest(pool, owner, "searchable", payload);
  expect((await search(pool, owner, { query: "alpha -gamma" })).items).toHaveLength(1);
  expect((await search(pool, owner, { query: "alpha NOT beta" })).items).toHaveLength(0);
  expect((await search(pool, owner, { query: 'gamma OR "alpha beta"' })).items).toHaveLength(1);
  expect((await search(pool, owner, { query: "run" })).items).toHaveLength(0);
  expect((await search(pool, owner, { query: "ALPHA.*beta", regex: true })).items).toHaveLength(1);
  await expect(search(pool, owner, { query: "[", regex: true })).rejects.toThrow(
    "Invalid PostgreSQL regex",
  );
  expect((await search(pool, { ...owner, orgId: "other" }, { query: "alpha" })).items).toHaveLength(
    0,
  );
  const listed = await sessions(pool, owner, { branch: "main" });
  expect(listed.items).toHaveLength(1);
  expect(
    (await sessionDetail(pool, owner, listed.items[0]!.id.slice(0, 8), { maxChars: 5 })).messages[0]
      ?.text,
  ).toBe("alpha");
  expect((await usage(pool, owner, {})).totals?.output).toBe(5);
  payload.messages[0]!.rev = 2;
  payload.messages[0]!.usage!.output = 9;
  await ingest(pool, owner, "searchable", payload);
  expect((await usage(pool, owner, {})).totals?.output).toBe(9);
});
