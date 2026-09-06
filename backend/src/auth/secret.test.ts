import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadSecret } from "./secret";

const directories: string[] = [];
const scratch = async () => {
  const folder = await mkdtemp(join(tmpdir(), "openhivemind-secret-"));
  directories.push(folder);
  return folder;
};
afterEach(async () => {
  for (const folder of directories.splice(0)) {
    await chmod(folder, 0o700).catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});

it("creates a secret once and reuses it across restarts", async () => {
  const folder = join(await scratch(), "state");
  const first = await loadSecret(folder);
  expect(first.length).toBeGreaterThanOrEqual(32);
  expect(await loadSecret(folder)).toBe(first);
  expect(await readFile(join(folder, "auth-secret"), "utf8")).toBe(first);
});

it("explains how to fix an unwritable state directory instead of failing with EACCES", async () => {
  const folder = join(await scratch(), "state");
  await mkdir(folder, { mode: 0o700 });
  await chmod(folder, 0o500);
  await expect(loadSecret(folder)).rejects.toThrow(/permission denied[\s\S]*chown/);
});

it("explains an unreadable existing secret the same way", async () => {
  const folder = await scratch();
  await writeFile(join(folder, "auth-secret"), "x".repeat(96), { mode: 0o000 });
  await expect(loadSecret(folder)).rejects.toThrow(/permission denied/);
});
