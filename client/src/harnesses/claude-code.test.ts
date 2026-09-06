import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cp, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeCodeChildren,
  claudeCodeEvent,
  claudeCodeLocate,
  claudeCodeTitle,
} from "./claude-code";
import { refreshEvent } from "./index";
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
it("finds Claude's latest native title for an EOF drain refresh", async () => {
  await writeFile(
    event.transcriptPath,
    [
      JSON.stringify({ type: "ai-title", aiTitle: "Earlier title" }),
      JSON.stringify({ type: "ai-title", payload: { aiTitle: "Current title" } }),
    ].join("\n") + "\n",
  );
  expect(await claudeCodeTitle(event.transcriptPath)).toBe("Current title");
  expect((await refreshEvent(event)).title).toBe("Current title");
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
it("refuses an ambiguous session id present under more than one project", async () => {
  vi.stubEnv("HOME", folder);
  const first = join(folder, ".claude/projects/-one");
  const second = join(folder, ".claude/projects/-two");
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await writeFile(join(first, id + ".jsonl"), '{"cwd":"/tmp"}\n');
  await writeFile(join(second, id + ".jsonl"), '{"cwd":"/tmp"}\n');
  await expect(claudeCodeLocate(id)).rejects.toThrow(/more than one project/);
  vi.unstubAllEnvs();
});
it("refuses to locate a subagent transcript directly as a root session", async () => {
  await expect(
    claudeCodeLocate(join(folder, "session-1/subagents/agent-a1b2c3d4e5f60718a.jsonl")),
  ).rejects.toThrow(/subagent transcript/);
});
it("skips an unparseable line and still finds a cwd on a later one", async () => {
  const path = join(folder, "skip-me.jsonl");
  await writeFile(path, 'not json\n{"cwd":"/projects/example"}\n');
  const found = await claudeCodeLocate(path);
  expect(found?.cwd).toBe("/projects/example");
});
it("throws a clear error when no line carries a cwd", async () => {
  const path = join(folder, "no-cwd.jsonl");
  await writeFile(path, "not json\n".repeat(5));
  await expect(claudeCodeLocate(path)).rejects.toThrow(/No cwd recorded/);
});
it("marks a stale transcript completed but leaves a fresh one alone", async () => {
  const path = join(folder, "age.jsonl");
  await writeFile(path, '{"cwd":"/projects/example"}\n');
  const fresh = await claudeCodeLocate(path);
  expect(fresh?.completed).toBeUndefined();
  const old = new Date(Date.now() - 11 * 60 * 1000);
  await utimes(path, old, old);
  const stale = await claudeCodeLocate(path);
  expect(stale?.completed).toBe(true);
});
