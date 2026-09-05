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
  bytes: number;
  last?: string;
}
async function spoolReport(config: Config): Promise<Spool> {
  const root = stateRoot(config);
  const report: Spool = { sessions: 0, pending: 0, dead: 0, paused: [], gap: [], bytes: 0 };
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
        event: { sessionId: string };
      };
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
  } catch {
    fail(`Configuration: missing or invalid at ${configPath()}; run openhivemind setup <url>`);
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
  lines.push(
    `Claude Code plugin: ${(await pluginInstalled()) ? "installed" : "not installed (run /plugin marketplace add openhivemind/openhivemind, then /plugin install openhivemind)"}`,
  );
  for (const problem of await ignoreProblems()) fail(problem);
  const spool = await spoolReport(config);
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
