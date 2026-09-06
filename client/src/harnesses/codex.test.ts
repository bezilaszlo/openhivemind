import { afterEach, beforeEach, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexChildren, codexEvent, codexTitle } from "./codex";
import { hookEvent } from "./index";
const fixtures = fileURLToPath(new URL("../../../fixtures/codex/rollouts/", import.meta.url));
const parent = "rollout-2026-09-05T10-00-00-fixture-thread-1.jsonl";
let home: string, day: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "openhivemind-codex-"));
  day = join(home, "sessions/2026/09/05");
  await cp(fixtures, day, { recursive: true });
  process.env["CODEX_HOME"] = home;
});
afterEach(async () => {
  delete process.env["CODEX_HOME"];
  await rm(home, { recursive: true, force: true });
});
const input = (extra: Record<string, unknown> = {}) => ({
  session_id: "fixture-thread-1",
  transcript_path: join(day, parent),
  cwd: "/projects/example",
  hook_event_name: "Stop",
  model: "fixture-model",
  turn_id: "fixture-turn",
  ...extra,
});
it("maps Stop and SessionEnd and ignores every other event", async () => {
  expect(await codexEvent(input())).toEqual({
    sessionId: "fixture-thread-1",
    transcriptPath: join(day, parent),
    cwd: "/projects/example",
    source: "codex",
  });
  expect(
    (await codexEvent(input({ hook_event_name: "SessionEnd", reason: "other" })))!.completed,
  ).toBe(true);
  expect(await codexEvent(input({ hook_event_name: "PreToolUse" }))).toBeUndefined();
  await expect(codexEvent({ hook_event_name: "Stop" })).rejects.toThrow("session_id");
});
it("finds the rollout by filename when the hook sends no transcript path", async () => {
  const found = await codexEvent(input({ transcript_path: null }));
  expect(found!.transcriptPath).toBe(join(day, parent));
  await expect(codexEvent(input({ transcript_path: null, session_id: "absent" }))).rejects.toThrow(
    "No rollout file",
  );
});
it("uses the latest Codex resume-menu title from its local index", async () => {
  await writeFile(
    join(home, "session_index.jsonl"),
    [
      JSON.stringify({ id: "fixture-thread-1", thread_name: "Old title" }),
      JSON.stringify({ id: "fixture-thread-1", thread_name: "Current title" }),
    ].join("\n") + "\n",
  );
  expect(await codexTitle("fixture-thread-1")).toBe("Current title");
  expect((await codexEvent(input()))!.title).toBe("Current title");
});
it("names a child by its agent path and reads past the inherited parent history", async () => {
  const event = (await codexEvent(input({ hook_event_name: "SessionEnd", reason: "other" })))!;
  const found = await codexChildren(event);
  expect(found).toEqual([
    {
      sessionId: "fixture-thread-2",
      transcriptPath: join(day, "rollout-2026-09-05T10-05-00-fixture-thread-2.jsonl"),
      cwd: "/projects/example/worker",
      source: "codex",
      parentId: "fixture-thread-1",
      spawnDepth: 1,
      title: "/root/fixture_worker",
      completed: true,
    },
  ]);
  expect(await codexChildren(found[0]!)).toEqual([]);
});
it("finds a child spawned after midnight in the next day's directory", async () => {
  const tomorrow = join(home, "sessions/2026/09/06");
  await mkdir(tomorrow, { recursive: true });
  await writeFile(
    join(tomorrow, "rollout-2026-09-06T00-04-00-fixture-thread-4.jsonl"),
    JSON.stringify({
      type: "session_meta",
      ordinal: 0,
      payload: {
        id: "fixture-thread-4",
        session_id: "fixture-thread-1",
        cwd: "/projects/example",
        agent_path: "/root/fixture_night_worker",
      },
    }) + "\n",
  );
  const found = await codexChildren((await codexEvent(input()))!);
  expect(found.map((child) => child.sessionId)).toEqual(["fixture-thread-2", "fixture-thread-4"]);
  expect(found[1]!.title).toBe("/root/fixture_night_worker");
});
it("routes hook input by transcript name and leaves Claude Code alone", async () => {
  expect((await hookEvent(input()))!.source).toBe("codex");
  expect(
    (await hookEvent({
      session_id: "abc",
      transcript_path: "/home/dev/.claude/projects/x/abc.jsonl",
      cwd: "/tmp",
      hook_event_name: "Stop",
    }))!.source,
  ).toBe("claude-code");
});
