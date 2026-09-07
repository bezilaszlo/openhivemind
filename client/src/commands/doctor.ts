import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createApi, routes, ignorePatterns, PROTOCOL_VERSION } from "@openhivemind/shared";
import { configPath, loadConfig, type Config } from "../config";
import { stateHome, stateRoot, upgradePath, type Upgrade } from "../state";
import { spoolBytes } from "../capture";
interface Spool {
  sessions: number;
  pending: number;
  dead: number;
  paused: string[];
  gap: string[];
  sources: string[];
  bytes: number;
  last?: string;
}
async function spoolReport(config: Config): Promise<Spool> {
  const root = stateRoot(config);
  const report: Spool = {
    sessions: 0,
    pending: 0,
    dead: 0,
    paused: [],
    gap: [],
    sources: [],
    bytes: 0,
  };
  const files = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const file of files) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    if (file.name.endsWith(".dead")) report.dead++;
    else if (file.name.endsWith(".batch.json")) report.pending++;
    else if (file.name === "state.json") {
      report.sessions++;
      const state = JSON.parse(await readFile(path, "utf8")) as {
        paused?: boolean;
        gap?: boolean;
        event: { sessionId: string; source: string };
      };
      if (!report.sources.includes(state.event.source)) report.sources.push(state.event.source);
      if (state.paused) report.paused.push(state.event.sessionId);
      if (state.gap) report.gap.push(state.event.sessionId);
      const when = (await stat(path)).mtime.toISOString();
      if (!report.last || when > report.last) report.last = when;
    }
  }
  report.bytes = await spoolBytes(root).catch(() => 0);
  return report;
}
async function ignoreProblems(): Promise<string[]> {
  const problems: string[] = [];
  const path = join(homedir(), ".config/openhivemind/ignore");
  try {
    ignorePatterns(await readFile(path, "utf8"));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      problems.push(
        `Ignore file ${path}: ${error instanceof Error ? error.message : "unreadable"}`,
      );
  }
  return problems;
}
async function pluginInstalled(): Promise<boolean> {
  const installed = await readFile(
    join(homedir(), ".claude/plugins/installed_plugins.json"),
    "utf8",
  ).catch(() => "{}");
  const value = JSON.parse(installed) as { plugins?: Record<string, unknown> };
  return Object.keys(value.plugins ?? {}).some((name) => name.startsWith("openhivemind@"));
}
// Codex records an installed plugin as a `[plugins."<name>@<marketplace>"]` section in its config.
async function codexPluginEnabled(): Promise<boolean> {
  const home = process.env["CODEX_HOME"] || join(homedir(), ".codex");
  const config = await readFile(join(home, "config.toml"), "utf8").catch(() => "");
  const section = config.split(/^\[/m).find((part) => part.startsWith('plugins."openhivemind@'));
  return Boolean(section) && !/^enabled\s*=\s*false/m.test(section!);
}
// opencode auto-discovers any plugin file in a config root's `plugin/` (or `plugins/`) folder and
// also loads whatever the config's `plugin[]` array names, so either counts as installed.
async function opencodePluginInstalled(): Promise<boolean> {
  const home = join(process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "opencode");
  for (const folder of ["plugin", "plugins"])
    if (
      (await readdir(join(home, folder)).catch(() => [])).some((name) =>
        name.startsWith("openhivemind."),
      )
    )
      return true;
  for (const name of ["opencode.json", "opencode.jsonc", "config.json"]) {
    const config = await readFile(join(home, name), "utf8").catch(() => "");
    if (/"plugin"\s*:\s*\[[^\]]*openhivemind/.test(config)) return true;
  }
  return false;
}
// One bounded line per check; problems make the command exit non-zero.
export async function doctor(): Promise<{ lines: string[]; ok: boolean }> {
  const lines: string[] = [];
  let ok = true;
  const fail = (line: string) => {
    ok = false;
    lines.push(line);
  };
  let config: Config;
  try {
    config = await loadConfig();
    const mode = ((await stat(configPath())).mode & 0o777).toString(8);
    lines.push(`Configuration: ${configPath()} (mode ${mode})`);
    if (mode !== "600") fail("  the configuration file should be mode 600");
  } catch (error) {
    fail(`Configuration: ${error instanceof Error ? error.message : `invalid at ${configPath()}`}`);
    return { lines, ok };
  }
  try {
    const info = await createApi(config.server)(routes.config);
    lines.push(
      `Server: ${config.server} reachable, protocol ${info.protocol.current} (minimum ${info.protocol.minimum}), client ${PROTOCOL_VERSION}`,
    );
    if (PROTOCOL_VERSION < info.protocol.minimum) fail("  upgrade client: the server refuses it");
    if (PROTOCOL_VERSION > info.protocol.current)
      fail("  upgrade server: it is older than this client");
  } catch (error) {
    fail(
      `Server: ${config.server} unreachable (${error instanceof Error ? error.message : "failed"})`,
    );
  }
  try {
    const org = await createApi(config.server, config.token)(routes.org);
    lines.push(`Token: valid for ${org.name} as ${org.role}`);
  } catch (error) {
    fail(`Token: rejected (${error instanceof Error ? error.message : "failed"})`);
  }
  lines.push(`Roots: ${config.roots.length ? config.roots.join(", ") : "every git checkout"}`);
  lines.push(`Exclude: ${config.exclude.length ? config.exclude.join(", ") : "none"}`);
  if (config.readOnly) lines.push("Capture: disabled by read-only setup");
  const spool = await spoolReport(config);
  lines.push(
    `Claude Code plugin: ${(await pluginInstalled()) ? "installed" : "not installed (run /plugin marketplace add openhivemind/openhivemind, then /plugin install openhivemind)"}`,
  );
  // Codex discovers the plugin's hooks but runs them only once they are trusted, and skips
  // untrusted ones in silence (issues #16430 / #17532), so a plugin that never fired matters.
  lines.push(
    `Codex CLI plugin: ${
      !(await codexPluginEnabled())
        ? "not installed (run codex plugin marketplace add openhivemind/openhivemind, then codex plugin add openhivemind@openhivemind)"
        : spool.sources.includes("codex")
          ? "installed, bundled hooks fire"
          : "installed, but no turn has been captured yet; its hooks run only once trusted from the Codex TUI"
    }`,
  );
  lines.push(
    `opencode plugin: ${
      !(await opencodePluginInstalled())
        ? "not installed (link client/plugins/opencode/openhivemind.js into ~/.config/opencode/plugin/)"
        : spool.sources.includes("opencode")
          ? "installed, session.idle fires"
          : "installed, but no session has been captured yet"
    }`,
  );
  for (const problem of await ignoreProblems()) fail(problem);
  lines.push(
    `Capture: ${spool.sessions} session(s), last ${spool.last ?? "never"}; spool ${spool.bytes} bytes in ${spool.pending} chunk file(s)`,
  );
  if (spool.paused.length)
    fail(
      `  capture paused, ${spool.pending} chunks pending: ${spool.paused.slice(0, 5).join(", ")}`,
    );
  if (spool.gap.length)
    fail(`  permanent gap, transcript gone: ${spool.gap.slice(0, 5).join(", ")}`);
  if (spool.dead) fail(`  ${spool.dead} chunk(s) rejected permanently and set aside`);
  const upgrade = await readFile(upgradePath(config), "utf8").catch(() => "");
  if (upgrade) {
    const value = JSON.parse(upgrade) as Upgrade;
    fail(`  upgrade client: uploads stopped at ${value.at} (${value.detail})`);
  }
  lines.push(`Log: ${join(stateHome(), "hook.log")}`);
  return { lines, ok };
}
