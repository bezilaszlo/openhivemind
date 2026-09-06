import { afterEach, expect, it, vi } from "vitest";
import { sessions } from "./sessions";
import { options } from "../args";
import type { Config } from "../config";
import type { Session } from "@openhivemind/shared";
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
afterEach(() => vi.unstubAllGlobals());
it("lists sessions as a plain table", async () => {
  let requestedUrl = "";
  vi.stubGlobal("fetch", async (input: URL) => {
    requestedUrl = String(input);
    return Response.json({ items: [session], cursor: null });
  });
  const result = await sessions(config, options([]));
  expect(result.exitCode).toBe(0);
  const text = result.lines.join("\n");
  expect(text).toContain("session-1");
  expect(text).toContain("Fix the widget");
  expect(text).toContain("claude-code");
  expect(requestedUrl).toContain("/api/v1/sessions");
});
it("computes --days into a since filter", async () => {
  let requestedUrl = "";
  vi.stubGlobal("fetch", async (input: URL) => {
    requestedUrl = String(input);
    return Response.json({ items: [session], cursor: null });
  });
  await sessions(config, options(["--days", "7"]));
  const since = new URL(requestedUrl).searchParams.get("since");
  expect(since).toBeTruthy();
  expect(Date.parse(since!)).toBeLessThan(Date.now());
});
it("reports no sessions with exit code 1", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [], cursor: null }));
  const result = await sessions(config, options([]));
  expect(result.exitCode).toBe(1);
});
it("rejects an invalid --days", async () => {
  const result = await sessions(config, options(["--days", "-3"]));
  expect(result.exitCode).toBe(2);
});
it("rejects --days combined with --since", async () => {
  const result = await sessions(
    config,
    options(["--days", "7", "--since", "2026-01-01T00:00:00Z"]),
  );
  expect(result.exitCode).toBe(2);
});
it("hints when the response carries a cursor", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [session], cursor: "next" }));
  const result = await sessions(config, options([]));
  expect(result.lines.join("\n")).toContain("More sessions available");
});
it("rejects an unknown --kind before sending the request", async () => {
  const result = await sessions(config, options(["--kind", "bogus"]));
  expect(result.exitCode).toBe(2);
});
it("says the cap is reached, not to increase --limit, when --limit is already 100", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [session], cursor: "next" }));
  const result = await sessions(config, options(["--limit", "100"]));
  expect(result.lines.join("\n")).toContain("truncated at the maximum limit");
});
