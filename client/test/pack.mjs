import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const folder = await mkdtemp(join(tmpdir(), "openhivemind-pack-"));
try {
  execFileSync("pnpm", ["--dir", "client", "pack", "--pack-destination", folder], {
    stdio: "pipe",
  });
  const tarball = (await readdir(folder)).find((name) => name.endsWith(".tgz"));
  assert(tarball);
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      folder,
      join(folder, tarball),
    ],
    { stdio: "pipe" },
  );
  const binary = resolve(folder, "node_modules/openhivemind/dist/cli.js");
  assert.equal(
    execFileSync(process.execPath, [binary, "--version"], { encoding: "utf8" }).trim(),
    "0.1.0",
  );
  assert.deepEqual(
    execFileSync(process.execPath, [binary, "skills"], { encoding: "utf8" }).trim().split("\n"),
    ["gist", "search", "setup", "share"],
  );
  try {
    execFileSync(process.execPath, [binary, "invalid"], { stdio: "pipe" });
    assert.fail("invalid command succeeded");
  } catch (error) {
    assert.equal(error.status, 2);
  }
  console.log("Clean tarball install, executable, bundled skills and usage exit code passed.");
} finally {
  await rm(folder, { recursive: true, force: true });
}
