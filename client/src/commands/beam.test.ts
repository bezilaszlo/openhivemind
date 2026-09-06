import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import lockfile from "proper-lockfile";
import { beam } from "./beam";
import { saveConfig } from "../config";
import { digest, stateRoot } from "../state";
let home: string, repo: string, transcript: string, config: Parameters<typeof saveConfig>[0];
const sessionId = "11111111-2222-4333-8444-555555555555";
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "openhivemind-beam-"));
  vi.stubEnv("HOME", home);
  repo = join(home, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:example/beam.git"]);
  const records = (
    JSON.parse(
      await readFile(
        new URL("../../../fixtures/claude-code/session.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>[]
  ).map((record) => (record["cwd"] !== undefined ? { ...record, cwd: repo } : record));
  transcript = join(home, sessionId + ".jsonl");
  await writeFile(transcript, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  config = {
    server: "http://localhost:3000",
    token: "ohm_test",
    org: "org",
    roots: [],
    exclude: [],
  };
  await saveConfig(config);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});
async function spooled() {
  const root = stateRoot(config);
  const files = (await readdir(root, { recursive: true }).catch(() => [])).filter((name) =>
    name.endsWith(".batch.json"),
  );
  return Promise.all(
    files.map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))),
  );
}
async function stateOf() {
  return JSON.parse(
    await readFile(join(stateRoot(config), "claude-code", digest(sessionId), "state.json"), "utf8"),
  );
}
async function backdate(path: string, msAgo: number) {
  const old = new Date(Date.now() - msAgo);
  await utimes(path, old, old);
}
const withSubagents = () =>
  cp(
    new URL("../../../fixtures/claude-code/subagents/", import.meta.url),
    join(home, sessionId, "subagents"),
    {
      recursive: true,
    },
  );
const options = {
  transport: (() =>
    Promise.reject(new Error("no network in this test"))) as unknown as typeof fetch,
  sleep: () => Promise.resolve(),
};
it("marks a transcript untouched for a while as completed", async () => {
  await backdate(transcript, 11 * 60 * 1000);
  const result = await beam(transcript, config, options);
  expect(result.sessionId).toBe(sessionId);
  expect(result.status).toBe("captured");
  expect(result.chunks).toBeGreaterThan(0);
  const chunks = (await spooled()).flatMap((batch) => batch.chunks);
  expect(chunks[0].meta.remote).toBe("github.com/example/beam");
  expect(chunks[0].meta.completed).toBe(true);
});
it("leaves a freshly written transcript uncompleted for its own hook to finish", async () => {
  const result = await beam(transcript, config, options);
  expect(result.status).toBe("captured");
  const chunks = (await spooled()).flatMap((batch) => batch.chunks);
  expect(chunks[0].meta.completed).toBe(false);
});
it("resolves a bare session id against the known Claude Code project directories", async () => {
  const projectDir = join(home, ".claude/projects/-home-example-beam");
  await mkdir(projectDir, { recursive: true });
  await rename(transcript, join(projectDir, sessionId + ".jsonl"));
  const result = await beam(sessionId, config, options);
  expect(result.sessionId).toBe(sessionId);
  expect(result.chunks).toBeGreaterThan(0);
});
it("captures a transcript larger than one read window across several calls", async () => {
  const records = (
    JSON.parse(
      await readFile(
        new URL("../../../fixtures/claude-code/session.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>[]
  ).map((record) => (record["cwd"] !== undefined ? { ...record, cwd: repo } : record));
  // Repeat the fixture with distinct uuids so each copy produces genuinely new messages,
  // padding well past a tiny read window: capture() needs several calls to reach the end.
  const lines = Array.from({ length: 6 }, (_, copy) =>
    records.map((record) =>
      JSON.stringify("uuid" in record ? { ...record, uuid: `${record["uuid"]}-${copy}` } : record),
    ),
  ).flat();
  await writeFile(transcript, lines.join("\n") + "\n");
  const size = (await readFile(transcript)).length;
  const result = await beam(transcript, config, { ...options, readWindow: 10000 });
  expect(result.status).toBe("captured");
  expect(result.chunks).toBeGreaterThan(1);
  expect((await stateOf()).offset).toBe(size);
});
it("fails loudly instead of silently stalling on a line longer than the read window", async () => {
  const huge = JSON.stringify({
    type: "user",
    uuid: "huge",
    timestamp: new Date().toISOString(),
    cwd: repo,
    message: { role: "user", content: "x".repeat(20000) },
  });
  await writeFile(transcript, huge + "\n");
  await expect(beam(transcript, config, { ...options, readWindow: 4096 })).rejects.toThrow(
    /longer than the capture read window/,
  );
  // Nothing should have been spooled from the doomed attempt, and the offset must stay put so a
  // later hook does not inherit a stuck cursor silently.
  expect(await spooled()).toHaveLength(0);
});
it("captures subagent children alongside the root session and sums their chunks", async () => {
  await withSubagents();
  const result = await beam(transcript, config, options);
  expect(result.children).toBe(2);
  const chunks = await spooled().then((batches) => batches.flatMap((batch) => batch.chunks));
  const childChunks = chunks.filter((chunk) => chunk.meta.parent_external_id);
  expect(childChunks).toHaveLength(2);
  expect(result.chunks).toBe(chunks.length);
});
it("leaves a session's state resumable from the beamed offset, same as the hook", async () => {
  await beam(transcript, config, options);
  const state = await stateOf();
  const size = (await readFile(transcript, "utf8")).length;
  expect(state.offset).toBe(size);
  expect(state.event.sessionId).toBe(sessionId);
});
it("does not re-send an already-beamed session or its subagents", async () => {
  await withSubagents();
  const first = await beam(transcript, config, options);
  expect(first.children).toBe(2);
  const second = await beam(transcript, config, options);
  expect(second.chunks).toBe(0);
  expect(second.children).toBe(0);
});
it("surfaces a skipped upload instead of reporting it as sent", async () => {
  const root = stateRoot(config);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(root, { stale: 60000, update: 10000, retries: 0 });
  const result = await beam(transcript, config, options);
  await release();
  expect(result.uploaded.skipped).toBe(true);
  expect(result.uploaded.sent).toBe(0);
  expect((await spooled()).length).toBeGreaterThan(0);
});
it("throws for an input that resolves to no transcript", async () => {
  await expect(beam("99999999-9999-4999-8999-999999999999", config, options)).rejects.toThrow(
    /No Claude Code transcript/,
  );
});
