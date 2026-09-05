import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import lockfile from "proper-lockfile";
import { hook } from "./hook";
import { saveConfig } from "../config";
import { stateRoot } from "../state";
let home: string, repo: string, transcript: string, config: Parameters<typeof saveConfig>[0];
const sessionId = "11111111-2222-4333-8444-555555555555";
const stdin = (event: string) =>
  JSON.stringify({
    session_id: sessionId,
    transcript_path: transcript,
    cwd: repo,
    hook_event_name: event,
  });
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "openhivemind-hook-"));
  vi.stubEnv("HOME", home);
  repo = join(home, "repo");
  await mkdir(repo);
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:example/hook.git"]);
  const records = JSON.parse(
    await readFile(new URL("../../../fixtures/claude-code/session.json", import.meta.url), "utf8"),
  ) as unknown[];
  transcript = join(home, "transcript.jsonl");
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
it("spools a Stop event, starts one uploader and logs without transcript text", async () => {
  let started = 0;
  await hook({ input: stdin("Stop"), startUploader: () => void started++ });
  const chunks = (await spooled()).flatMap((batch) => batch.chunks);
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks[0].meta.remote).toBe("github.com/example/hook");
  expect(chunks[0].meta.completed).toBe(false);
  expect(chunks[0].messages.length).toBeGreaterThan(0);
  expect(started).toBe(1);
  const log = await readFile(join(home, ".local/state/openhivemind/hook.log"), "utf8");
  expect(log).toContain(`session=${sessionId} status=captured`);
  expect(log).not.toContain(chunks[0].messages[0].text);
});
it("marks the session complete on SessionEnd", async () => {
  await hook({ input: stdin("Stop"), startUploader: () => {} });
  await hook({ input: stdin("SessionEnd"), startUploader: () => {} });
  expect(
    (await spooled()).flatMap((batch) => batch.chunks).some((chunk) => chunk.meta.completed),
  ).toBe(true);
});
it("does not start a second uploader while one holds the lock", async () => {
  const root = stateRoot(config);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(root, { stale: 60000, update: 10000, retries: 0 });
  let started = 0;
  await hook({ input: stdin("Stop"), startUploader: () => void started++ });
  await release();
  expect(started).toBe(0);
  expect((await spooled()).length).toBe(1);
});
it("ignores other hook events and survives malformed input", async () => {
  await hook({ input: stdin("PreToolUse"), startUploader: () => {} });
  await hook({ input: "not json", startUploader: () => {} });
  expect(await spooled()).toHaveLength(0);
  expect(await readFile(join(home, ".local/state/openhivemind/hook.log"), "utf8")).toContain(
    "status=error error=SyntaxError",
  );
});
it("prints the payload and writes nothing on a dry run", async () => {
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  await hook({ input: stdin("Stop"), dryRun: true, startUploader: () => {} });
  expect(JSON.parse(printed.mock.calls[0]![0] as string)[0].messages.length).toBeGreaterThan(0);
  printed.mockRestore();
  expect(await spooled()).toHaveLength(0);
});
