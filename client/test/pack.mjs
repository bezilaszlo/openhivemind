import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
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
  const plugin = resolve(folder, "node_modules/openhivemind/plugins/claude-code");
  const manifest = JSON.parse(await readFile(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.name, "openhivemind");
  const hooks = JSON.parse(await readFile(join(plugin, "hooks/hooks.json"), "utf8"));
  for (const event of ["Stop", "SessionEnd"])
    assert.match(
      hooks.hooks[event][0].hooks[0].command,
      /\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/cli\.js" hook$/,
    );
  assert.equal(hooks.hooks.Stop[0].hooks[0].async, true);
  assert.deepEqual((await readdir(join(plugin, "skills"))).sort(), [
    "gist",
    "search",
    "setup",
    "share",
  ]);
  // The plugin copy runs with no node_modules of its own.
  assert.equal(
    execFileSync(process.execPath, [join(plugin, "dist/cli.js"), "--version"], {
      encoding: "utf8",
      cwd: folder,
    }).trim(),
    "0.1.0",
  );
  console.log(
    "Clean tarball install, executable, bundled skills, plugin manifest and usage exit code passed.",
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
