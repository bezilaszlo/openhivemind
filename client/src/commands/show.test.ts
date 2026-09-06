import { afterEach, expect, it, vi } from "vitest";
import { show } from "./show";
import { options } from "../args";
import type { Config } from "../config";
import type { Session, Message } from "@openhivemind/shared";
const config: Config = {
  server: "http://server.test",
  token: "ohm_secret",
  org: "org",
  roots: [],
  exclude: [],
};
const session: Session = {
  id: "session-1",
  external_id: "ext-1",
  owner_user_id: "user-1",
  parent_session_id: null,
  last_activity_at: "2026-09-05T10:00:00Z",
  received_at: "2026-09-05T10:00:00Z",
  tokens: null,
  messageCount: 5,
  childCount: 0,
  agents: null,
  lastPrompt: null,
  lastReply: null,
  summary: null,
  source: "claude-code",
  version: "1.0.0",
  remote: "github.com/example/repo",
  cwd: "/repo",
  branch: "main",
  branches: ["main"],
  title: "Fix the widget",
  started_at: "2026-09-05T09:00:00Z",
  completed: true,
  spawn_depth: 0,
  models: ["claude-sonnet"],
};
const messages: Message[] = Array.from({ length: 5 }, (_, index) => ({
  seq: index + 1,
  rev: 1,
  kind: index % 2 === 0 ? "prompt" : "reply",
  text: index === 2 ? "please fix the widget urgently" : `message ${index + 1}`,
  ts: "2026-09-05T09:0" + index + ":00Z",
}));
afterEach(() => vi.unstubAllGlobals());
it("shows the message window without a match", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ session, messages, cursor: null }));
  const result = await show(config, options(["session-1"]));
  expect(result.exitCode).toBe(0);
  const text = result.lines.join("\n");
  expect(text).toContain("Fix the widget");
  expect(text).toContain("session-1");
  expect(text).toContain("message 1");
});
it("slices a window around a --match", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ session, messages, cursor: null }));
  const result = await show(
    config,
    options(["session-1", "--match", "urgently", "--context", "1"]),
  );
  expect(result.exitCode).toBe(0);
  const text = result.lines.join("\n");
  expect(text).toContain("please fix the widget urgently");
  expect(text).toContain("message 2");
  expect(text).toContain("message 4");
  expect(text).not.toContain("message 1\n");
});
it("exits 1 when no message matches", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ session, messages, cursor: null }));
  const result = await show(config, options(["session-1", "--match", "nope"]));
  expect(result.exitCode).toBe(1);
});
it("exits 2 on an invalid regex", async () => {
  const result = await show(config, options(["session-1", "--regex", "("]));
  expect(result.exitCode).toBe(2);
});
it("requires a session id", async () => {
  const result = await show(config, options([]));
  expect(result.exitCode).toBe(2);
});
it("rejects an out-of-range --last", async () => {
  const result = await show(config, options(["session-1", "--last", "501"]));
  expect(result.exitCode).toBe(2);
});
it("rejects a non-integer --last", async () => {
  const result = await show(config, options(["session-1", "--last", "abc"]));
  expect(result.exitCode).toBe(2);
});
it("rejects --match combined with --regex", async () => {
  const result = await show(config, options(["session-1", "--match", "x", "--regex", "y"]));
  expect(result.exitCode).toBe(2);
});
it("sends an explicit maxChars so the 500-message scan window is not cut short", async () => {
  let requestedUrl = "";
  vi.stubGlobal("fetch", async (input: URL) => {
    requestedUrl = String(input);
    return Response.json({ session, messages, cursor: null });
  });
  await show(config, options(["session-1", "--match", "urgently"]));
  const url = new URL(requestedUrl);
  expect(url.searchParams.get("last")).toBe("500");
  expect(Number(url.searchParams.get("maxChars"))).toBeGreaterThan(20000);
});
it("reports the actual message count received, not a hardcoded window, when nothing matches", async () => {
  const short = messages.slice(0, 2);
  vi.stubGlobal("fetch", async () => Response.json({ session, messages: short, cursor: null }));
  const result = await show(config, options(["session-1", "--match", "nope"]));
  expect(result.exitCode).toBe(1);
  expect(result.lines.join("\n")).toContain("2 message(s) received");
});
