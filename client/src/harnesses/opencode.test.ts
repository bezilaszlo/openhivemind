import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { parseRecords } from "@openhivemind/shared";
import { capture, type Event } from "../capture";
import { opencodeChildren, opencodeEvent, opencodeRecords } from "./opencode";
import type { Config } from "../config";
const SCHEMA = `
CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT NOT NULL,
  title TEXT NOT NULL, version TEXT NOT NULL);
CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL);`;
interface Row {
  id: string;
  created_at: number;
  info: unknown;
  parts: Array<Record<string, unknown>>;
}
let folder: string, repo: string, database: string, config: Config;
function write(path: string, rows: Row[], sessionId = "ses_1") {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  db.prepare("INSERT INTO session VALUES (?, NULL, ?, ?, ?)").run(
    sessionId,
    repo,
    "New session - 2026-09-05T00:00:00.000Z",
    "1.18.29",
  );
  for (const row of rows) {
    db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
      row.id,
      sessionId,
      row.created_at,
      row.created_at,
      JSON.stringify(row.info),
    );
    for (const [index, part] of row.parts.entries()) {
      const { id, ...data } = part;
      db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)").run(
        String(id),
        row.id,
        sessionId,
        row.created_at + index,
        row.created_at + index,
        JSON.stringify(data),
      );
    }
  }
  db.close();
}
async function fixture(): Promise<Row[]> {
  return JSON.parse(
    await readFile(new URL("../../../fixtures/opencode/session.json", import.meta.url), "utf8"),
  ) as Row[];
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "openhivemind-opencode-"));
  vi.stubEnv("HOME", folder);
  repo = join(folder, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", [
    "-C",
    repo,
    "remote",
    "add",
    "origin",
    "https://github.com/example/project.git",
  ]);
  database = join(folder, "opencode.db");
  config = {
    server: "http://localhost:3000",
    org: "team",
    token: "unused",
    roots: [repo],
    exclude: [],
  };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});
it("reads the discovery capture out of SQLite into the golden normalisation", async () => {
  const rows = await fixture();
  write(database, rows);
  const golden = JSON.parse(
    await readFile(new URL("../../../fixtures/opencode/golden.json", import.meta.url), "utf8"),
  );
  const read = opencodeRecords(database, "ses_1", 0);
  expect(parseRecords("opencode", read.records)).toEqual(golden);
  expect(read.cursor).toBeGreaterThan(0);
});
it("advances the cursor past read rows and re-reads a row whose part was updated", async () => {
  const rows = await fixture();
  write(database, rows);
  const first = opencodeRecords(database, "ses_1", 0);
  expect(opencodeRecords(database, "ses_1", first.cursor).records).toEqual([]);
  const db = new DatabaseSync(database);
  db.prepare("UPDATE part SET time_updated = ?, data = ? WHERE id = ?").run(
    first.cursor + 10,
    JSON.stringify({ type: "text", text: "Rewritten" }),
    "fixture-id-56",
  );
  db.close();
  const second = opencodeRecords(database, "ses_1", first.cursor);
  expect(second.records).toHaveLength(1);
  expect((second.records[0] as Row).id).toBe("fixture-id-54");
  expect(second.cursor).toBe(first.cursor + 10);
});
it("re-emits an upserted message as a new revision of the same seq", async () => {
  write(database, [
    {
      id: "msg_1",
      created_at: 1788610968144,
      info: { role: "user", model: { modelID: "fixture-model" } },
      parts: [{ id: "prt_1", type: "text", text: "First draft" }],
    },
  ]);
  const event: Event = {
    sessionId: "ses_1",
    source: "opencode",
    cwd: repo,
    transcriptPath: database,
  };
  const before = await capture(event, config, { dryRun: true });
  expect(before.payloads?.[0]?.messages).toMatchObject([{ seq: 1, rev: 1, text: "First draft" }]);
  await capture(event, config);
  const db = new DatabaseSync(database);
  db.prepare("UPDATE part SET time_updated = ?, data = ? WHERE id = ?").run(
    1788610999999,
    JSON.stringify({ type: "text", text: "Second draft" }),
    "prt_1",
  );
  db.close();
  const after = await capture(event, config, { dryRun: true });
  expect(after.payloads?.[0]?.messages).toMatchObject([{ seq: 1, rev: 2, text: "Second draft" }]);
});
it("scrubs a secret written into a part before it leaves the laptop", async () => {
  write(database, [
    {
      id: "msg_1",
      created_at: 1788610968144,
      info: { role: "user" },
      parts: [
        { id: "prt_1", type: "text", text: "token ghp_0123456789abcdefghijklmnopqrstuvwxyzA" },
      ],
    },
  ]);
  const result = await capture(
    { sessionId: "ses_1", source: "opencode", cwd: repo, transcriptPath: database },
    config,
    { dryRun: true },
  );
  const text = JSON.stringify(result.payloads);
  expect(text).not.toContain("ghp_0123456789abcdefghijklmnopqrstuvwxyzA");
  expect(text).toContain("[REDACTED:api-key]");
});
it("takes cwd and a non-placeholder title from the session row", () => {
  write(database, []);
  const event = opencodeEvent({ source: "opencode", sessionId: "ses_1", dbPath: database });
  expect(event).toEqual({
    sessionId: "ses_1",
    transcriptPath: database,
    cwd: repo,
    source: "opencode",
    version: "1.18.29",
  });
  const db = new DatabaseSync(database);
  db.prepare("UPDATE session SET title = ? WHERE id = ?").run("Wire up capture", "ses_1");
  db.close();
  expect(opencodeEvent({ source: "opencode", sessionId: "ses_1", dbPath: database })).toMatchObject(
    { title: "Wire up capture" },
  );
});
it("flattens nested child sessions onto the root with their depth", () => {
  write(database, []);
  const db = new DatabaseSync(database);
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?)").run(
    "ses_child",
    "ses_1",
    repo,
    "Child",
    "1.18.29",
  );
  db.prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?)").run(
    "ses_grandchild",
    "ses_child",
    repo,
    "Grandchild",
    "1.18.29",
  );
  db.close();
  expect(
    opencodeChildren({
      sessionId: "ses_1",
      source: "opencode",
      cwd: repo,
      transcriptPath: database,
    }).map((child) => [child.sessionId, child.parentId, child.spawnDepth]),
  ).toEqual([
    ["ses_child", "ses_1", 1],
    ["ses_grandchild", "ses_1", 2],
  ]);
});
