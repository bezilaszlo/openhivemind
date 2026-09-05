import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { capture, type Event } from "./capture";
import type { Config } from "./config";
import { stateRoot, upgradePath } from "./state";
import { drain } from "./upload";
let home: string, repo: string, config: Config, event: Event;
let requests: { url: string; chunkId: string }[] = [];
const waits: number[] = [];
const sleep = async (ms: number) => void waits.push(ms);
const accepted = (chunkId: string) =>
  Response.json({ chunkId, committedThrough: 1 }, { status: 202 });
const problem = (status: number, headers?: Record<string, string>) =>
  Response.json({ detail: `rejected ${status}` }, { status, ...(headers ? { headers } : {}) });
function transport(reply: (index: number, chunkId: string) => Response): typeof fetch {
  return (async (input: URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { chunkId: string };
    requests.push({ url: String(input), chunkId: body.chunkId });
    return reply(requests.length - 1, body.chunkId);
  }) as unknown as typeof fetch;
}
const line = (index: number) =>
  JSON.stringify({
    type: "assistant",
    uuid: "message-" + index,
    timestamp: new Date().toISOString(),
    message: { id: "message-" + index, content: [{ type: "text", text: "turn " + index }] },
  });
async function spool(records = 1) {
  await writeFile(
    event.transcriptPath,
    Array.from({ length: records }, (_, index) => line(index)).join("\n") + "\n",
  );
  return capture(event, config);
}
const files = async () =>
  (await readdir(stateRoot(config), { recursive: true })).filter((name) => name.includes(".batch"));
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "openhivemind-upload-"));
  vi.stubEnv("HOME", home);
  requests = [];
  waits.length = 0;
  repo = join(home, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:example/up.git"]);
  config = {
    server: "http://server.test",
    token: "ohm_secret",
    org: "org-1",
    roots: [repo],
    exclude: [],
  };
  event = {
    sessionId: "session-1",
    source: "claude-code",
    cwd: repo,
    transcriptPath: join(home, "session.jsonl"),
  };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});
it("delivers an acknowledged chunk once and clears the spool", async () => {
  await spool();
  const result = await drain(config, { transport: transport((_, id) => accepted(id)), sleep });
  expect(result).toMatchObject({ sent: 1, pending: 0, errors: [] });
  expect(requests[0]!.url).toBe("http://server.test/api/v1/ingest/sessions/session-1");
  expect(await files()).toEqual([]);
});
it("keeps unacknowledged chunks and never re-sends an acknowledged one", async () => {
  await spool(600);
  const first = await drain(config, {
    transport: transport((index, id) => (index === 0 ? accepted(id) : problem(503))),
    sleep,
  });
  expect(first.sent).toBe(1);
  expect(first.pending).toBe(1);
  expect(waits).toEqual([500, 1000, 2000]);
  const acknowledged = requests[0]!.chunkId;
  requests = [];
  const second = await drain(config, { transport: transport((_, id) => accepted(id)), sleep });
  expect(second).toMatchObject({ sent: 1, pending: 0 });
  expect(requests.map((request) => request.chunkId)).not.toContain(acknowledged);
});
it("drops the whole session spool when the session was purged", async () => {
  await spool();
  const result = await drain(config, { transport: transport(() => problem(410)), sleep });
  expect(result.pending).toBe(0);
  expect(await files()).toEqual([]);
  const state = (await readdir(stateRoot(config), { recursive: true })).find((name) =>
    name.endsWith("state.json"),
  )!;
  expect(
    JSON.parse(await readFile(join(stateRoot(config), state), "utf8")) as { tombstoned?: boolean },
  ).toMatchObject({ tombstoned: true });
});
it("waits for Retry-After before delivering", async () => {
  await spool();
  const result = await drain(config, {
    transport: transport((index, id) =>
      index === 0 ? problem(429, { "retry-after": "2" }) : accepted(id),
    ),
    sleep,
  });
  expect(waits).toEqual([2000]);
  expect(result).toMatchObject({ sent: 1, pending: 0 });
});
it("sets a chunk aside after repeated permanent rejections", async () => {
  await spool();
  const options = { transport: transport(() => problem(409)), sleep };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await drain(config, options);
    expect(result.errors).toContain("HTTP 409");
    expect(result.pending).toBe(1);
  }
  const last = await drain(config, options);
  expect(last.errors).toContain("chunk rejected permanently");
  expect(last.pending).toBe(0);
  expect(await files()).toEqual([expect.stringContaining(".batch.json.dead")]);
});
it("stops every upload and records the upgrade when the protocol is refused", async () => {
  await spool();
  await spool(2);
  const result = await drain(config, { transport: transport(() => problem(426)), sleep });
  expect(result.errors).toContain("upgrade client");
  expect(requests).toHaveLength(1);
  expect(result.pending).toBe(2);
  expect(JSON.parse(await readFile(upgradePath(config), "utf8"))).toMatchObject({
    detail: "rejected 426",
  });
});
it("replays a chunk whose outcome was ambiguous", async () => {
  await spool();
  const result = await drain(config, {
    transport: transport((index, id) => {
      if (index === 0) throw new DOMException("The operation timed out", "TimeoutError");
      return accepted(id);
    }),
    sleep,
  });
  expect(requests.map((request) => request.chunkId)).toEqual([
    requests[0]!.chunkId,
    requests[0]!.chunkId,
  ]);
  expect(result).toMatchObject({ sent: 1, pending: 0 });
});
