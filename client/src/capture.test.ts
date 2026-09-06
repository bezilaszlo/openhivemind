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
const promptLine = (uuid: string, text: string) =>
  JSON.stringify({
    type: "user",
    uuid,
    timestamp: new Date().toISOString(),
    message: { content: text },
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
it("derives the title from the first non-empty line of a long pasted prompt, clamped to a word boundary", async () => {
  const filler = "widget ".repeat(700); // ~4.9 KB, well past the old 4096-char raw-slice title
  const prompt = "\n\n  " + filler + "\nSecond paragraph, irrelevant to the title.";
  await writeFile(event.transcriptPath, promptLine("one", prompt));
  await capture(event, config);
  const [batch] = await batches();
  const title = batch.chunks[0].meta.title as string;
  expect(title.length).toBeLessThanOrEqual(120);
  expect(title.endsWith("…")).toBe(true);
  expect(title.startsWith("widget widget widget")).toBe(true);
  expect(title).not.toContain("\n");
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
it("keeps a Codex subagent's inherited prefix out of the child across read windows", async () => {
  const record = (ordinal: number, role: string, text: string) =>
    JSON.stringify({
      type: "response_item",
      ordinal,
      timestamp: new Date().toISOString(),
      payload: {
        type: "message",
        id: `m-${ordinal}`,
        role,
        content: [{ type: "input_text", text }],
        internal_chat_message_metadata_passthrough: { content_item_kinds: ["user.text"] },
      },
    }) + "\n";
  const child: Event = {
    sessionId: "child-1",
    source: "codex",
    cwd: repo,
    transcriptPath: join(folder, "rollout-child.jsonl"),
    parentId: "parent-1",
  };
  const meta =
    JSON.stringify({
      type: "session_meta",
      ordinal: 0,
      timestamp: new Date().toISOString(),
      payload: {
        id: "child-1",
        session_id: "parent-1",
        cwd: repo,
        subagent_history_start_ordinal: 4,
      },
    }) + "\n";
  const inherited = [1, 2, 3].map((ordinal) => record(ordinal, "user", `inherited ${ordinal}`));
  await writeFile(child.transcriptPath, meta + inherited.join(""));
  // A window that ends inside the inherited prefix: the next read starts with no session_meta.
  const window = meta.length + inherited[0]!.length;
  await capture(child, config, { readWindow: window });
  await appendFile(child.transcriptPath, record(4, "user", "the child's own task"));
  for (let read = 0; read < 5; read++) await capture(child, config, { readWindow: window });
  const messages = (await batches()).flatMap((batch) =>
    batch.chunks.flatMap((chunk: { messages: { text: string }[] }) => chunk.messages),
  );
  expect(messages.map((message) => message.text)).toEqual(["the child's own task"]);
});
