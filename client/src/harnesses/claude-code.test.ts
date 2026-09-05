import { afterEach, beforeEach, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeChildren, claudeCodeEvent } from "./claude-code";
import type { Event } from "../capture";
let folder: string, event: Event;
const fixtures = new URL("../../../fixtures/claude-code/subagents/", import.meta.url);
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "openhivemind-harness-"));
  event = {
    sessionId: "session-1",
    transcriptPath: join(folder, "session-1.jsonl"),
    cwd: folder,
    source: "claude-code",
  };
  await writeFile(event.transcriptPath, "");
  await mkdir(join(folder, "session-1"), { recursive: true });
  await cp(fixtures, join(folder, "session-1/subagents"), { recursive: true });
});
afterEach(() => rm(folder, { recursive: true, force: true }));
it("maps the Stop and SessionEnd contract and ignores other events", () => {
  const input = {
    session_id: "abc",
    transcript_path: "/tmp/abc.jsonl",
    cwd: "/tmp",
    hook_event_name: "Stop",
  };
  expect(claudeCodeEvent(input)).toMatchObject({ sessionId: "abc", source: "claude-code" });
  expect(claudeCodeEvent(input)!.completed).toBeUndefined();
  expect(claudeCodeEvent({ ...input, hook_event_name: "SessionEnd" })!.completed).toBe(true);
  expect(claudeCodeEvent({ ...input, hook_event_name: "PreToolUse" })).toBeUndefined();
  expect(() => claudeCodeEvent({ hook_event_name: "Stop" })).toThrow("session_id");
});
it("discovers nested subagents from the flat folder and keeps the root as the parent", async () => {
  const found = await claudeCodeChildren(event);
  expect(found).toEqual([
    {
      sessionId: "session-1:a1b2c3d4e5f60718a",
      transcriptPath: join(folder, "session-1/subagents/agent-a1b2c3d4e5f60718a.jsonl"),
      cwd: folder,
      source: "claude-code",
      parentId: "session-1",
      spawnDepth: 1,
      title: "Fixture subagent task",
      modelExplicit: "claude-opus-5",
    },
    {
      sessionId: "session-1:b2c3d4e5f60718a2b",
      transcriptPath: join(folder, "session-1/subagents/agent-b2c3d4e5f60718a2b.jsonl"),
      cwd: folder,
      source: "claude-code",
      parentId: "session-1",
      spawnDepth: 2,
      title: "Fixture nested subagent task",
    },
  ]);
});
it("defaults depth to one when the sidecar metadata is missing and never recurses", async () => {
  await rm(join(folder, "session-1/subagents/agent-a1b2c3d4e5f60718a.meta.json"));
  const [first] = await claudeCodeChildren(event);
  expect(first).toMatchObject({ spawnDepth: 1 });
  expect(first!.title).toBeUndefined();
  expect(await claudeCodeChildren(first!)).toEqual([]);
});
it("returns nothing when the session has no subagents", async () => {
  await rm(join(folder, "session-1"), { recursive: true });
  expect(await claudeCodeChildren(event)).toEqual([]);
});
