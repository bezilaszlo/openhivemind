import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { search } from "./search";
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
  messageCount: 3,
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
beforeEach(() => {
  vi.stubGlobal("fetch", async (input: URL) => {
    const url = String(input);
    if (url.endsWith("/api/v1/search"))
      return Response.json({
        items: [
          {
            session,
            score: 1,
            seq: 1,
            kind: "prompt",
            snippet: "please fix the widget",
            context: [],
          },
          { session, score: 0.9, seq: 2, kind: "reply", snippet: "widget fixed", context: [] },
        ],
        cursor: null,
      });
    return Response.json({ detail: "not found" }, { status: 404 });
  });
});
it("groups hits by session and cites the session id", async () => {
  const result = await search(config, options(["widget"]));
  expect(result.exitCode).toBe(0);
  const text = result.lines.join("\n");
  expect(text).toContain("session-1");
  expect(text).toContain("2 hit(s)");
  expect(text).toContain("please fix the widget");
});
it("renders the context window returned per hit", async () => {
  const context: Message[] = [
    { seq: 2, rev: 1, kind: "prompt", text: "before", ts: "2026-09-05T09:00:00Z" },
    { seq: 3, rev: 1, kind: "reply", text: "widget fixed", ts: "2026-09-05T09:01:00Z" },
  ];
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [{ session, score: 1, seq: 3, kind: "reply", snippet: "widget fixed", context }],
      cursor: null,
    }),
  );
  const result = await search(config, options(["widget", "--context", "1"]));
  const text = result.lines.join("\n");
  expect(text).toContain("[2] prompt before");
  expect(text).toContain("→ [3] reply widget fixed");
});
it("ranks session groups by hit count, not first occurrence", async () => {
  const other: Session = { ...session, id: "session-2", title: "Other session" };
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [
        { session: other, score: 1, seq: 1, kind: "prompt", snippet: "one hit", context: [] },
        { session, score: 1, seq: 1, kind: "prompt", snippet: "hit a", context: [] },
        { session, score: 1, seq: 2, kind: "reply", snippet: "hit b", context: [] },
      ],
      cursor: null,
    }),
  );
  const result = await search(config, options(["widget"]));
  const text = result.lines.join("\n");
  expect(text.indexOf("session-1")).toBeLessThan(text.indexOf("session-2"));
});
it("hints when the response carries a cursor", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [{ session, score: 1, seq: 1, kind: "prompt", snippet: "hit", context: [] }],
      cursor: "next",
    }),
  );
  const result = await search(config, options(["widget"]));
  expect(result.lines.join("\n")).toContain("More results available");
});
it("requires a query", async () => {
  const result = await search(config, options([]));
  expect(result.exitCode).toBe(2);
});
it("reports no results with exit code 1", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [], cursor: null }));
  const result = await search(config, options(["nothing"]));
  expect(result.exitCode).toBe(1);
});
it("rejects an unknown --kind before sending the request", async () => {
  const result = await search(config, options(["widget", "--kind", "bogus"]));
  expect(result.exitCode).toBe(2);
});
it("says the cap is reached, not to increase --limit, when --limit is already 100", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      items: [{ session, score: 1, seq: 1, kind: "prompt", snippet: "hit", context: [] }],
      cursor: "next",
    }),
  );
  const result = await search(config, options(["widget", "--limit", "100"]));
  expect(result.lines.join("\n")).toContain("truncated at the maximum limit");
});
it("tells an unreachable hive apart from a rejected request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed");
    }),
  );
  const result = await search(config, options(["widget"]));
  expect(result.exitCode).toBe(2);
  expect(result.lines[0]).toBe(
    "Hive http://server.test unreachable (fetch failed); run openhivemind doctor",
  );
});
