import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NOT_CONFIGURED, loadConfig } from "./config";
afterEach(() => vi.unstubAllEnvs());
async function home(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ohm-config-"));
  vi.stubEnv("HOME", dir);
  return dir;
}
it("names the fresh-machine case and points at setup", async () => {
  await home();
  await expect(loadConfig()).rejects.toThrow(NOT_CONFIGURED);
});
it("reports a present but broken file as invalid, not missing", async () => {
  const dir = await home();
  const path = join(dir, ".config/openhivemind/config.json");
  await import("node:fs/promises").then((fs) =>
    fs.mkdir(join(dir, ".config/openhivemind"), { recursive: true }),
  );
  await writeFile(path, "{ not json");
  await expect(loadConfig()).rejects.toThrow(/Invalid configuration at .*config\.json/);
  await writeFile(path, JSON.stringify({ server: "x" }));
  await expect(loadConfig()).rejects.toThrow(/Invalid configuration/);
  await expect(loadConfig()).rejects.not.toThrow(NOT_CONFIGURED);
});
