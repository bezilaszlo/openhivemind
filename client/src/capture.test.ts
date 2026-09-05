import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  appendFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { capture, allowed, type Event } from "./capture";
import { stateRoot } from "./state";
import type { Config } from "./config";
let folder: string, repo: string, event: Event, config: Config;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "openhivemind-capture-"));
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
  config = {
    server: "http://localhost:3000",
    org: "team",
    token: "unused",
    roots: [repo],
    exclude: [],
  };
  event = {
    sessionId: "session-1",
    source: "claude-code",
    cwd: repo,
    transcriptPath: join(folder, "session.jsonl"),
  };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});
const line = (uuid: string, text: string) =>
  JSON.stringify({
    type: "assistant",
    uuid,
    timestamp: new Date().toISOString(),
    message: { id: uuid, content: [{ type: "text", text }] },
  }) + "\n";
async function batches() {
  const root = stateRoot(config);
  const files = await readdir(root, { recursive: true });
  return Promise.all(
    files
      .filter((name) => name.endsWith(".batch.json"))
      .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))),
  );
}
it("spools only scrubbed content and resumes complete records incrementally", async () => {
  const secret = "ohm_" + "ab".repeat(20);
  await writeFile(event.transcriptPath, line("one", secret) + '{"type":');
  expect((await capture(event, config)).chunks).toBe(1);
  const first = await batches();
  expect(JSON.stringify(first)).not.toContain(secret);
  expect(first[0].chunks[0].messages[0].text).toBe("[REDACTED:openhivemind]");
  expect((await capture(event, config)).chunks).toBe(0);
  await appendFile(
    event.transcriptPath,
    '"user","uuid":"two","timestamp":"' +
      new Date().toISOString() +
      '","message":{"content":"next"}}\n',
  );
  await capture(event, config);
  expect(
    (await batches()).flatMap((batch) =>
      batch.chunks.flatMap((chunk: { messages: unknown[] }) => chunk.messages),
    ),
  ).toHaveLength(2);
});
it("recovers the cursor and sequence map after a chunk-first crash", async () => {
  await writeFile(event.transcriptPath, line("one", "first"));
  await expect(
    capture(event, config, {
      afterChunk: async () => {
        throw new Error("simulated interruption");
      },
    }),
  ).rejects.toThrow("interruption");
  await appendFile(event.transcriptPath, line("two", "second"));
  await capture(event, config);
  expect(
    (await batches()).flatMap((batch) =>
      batch.chunks.flatMap((chunk: { messages: { seq: number }[] }) =>
        chunk.messages.map((message) => message.seq),
      ),
    ),
  ).toEqual([1, 2]);
});
it("compares resolved paths and lets exclusions win", async () => {
  const outside = join(folder, "outside");
  await mkdir(outside);
  await symlink(outside, join(repo, "escape"));
  expect(await allowed(join(repo, "escape"), config)).toBe(false);
  config.exclude = [repo];
  expect(await allowed(repo, config)).toBe(false);
  expect((await capture(event, config)).status).toBe("excluded");
});
it("pauses without advancing when the spool cap is reached", async () => {
  await writeFile(event.transcriptPath, line("one", "first"));
  config.spoolLimit = 1;
  expect((await capture(event, config)).status).toBe("paused");
  expect(await batches()).toHaveLength(0);
  config.spoolLimit = 100000;
  await capture(event, config);
  expect((await batches())[0].chunks[0].messages[0].seq).toBe(1);
});
it("fails closed when an ignore pattern is invalid", async () => {
  await writeFile(event.transcriptPath, line("one", "private"));
  await writeFile(join(repo, ".openhivemind-ignore"), "[");
  await expect(capture(event, config)).rejects.toThrow("line 1");
});
