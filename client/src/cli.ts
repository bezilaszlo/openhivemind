#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApi, routes } from "@openhivemind/shared";
import { doctor } from "./commands/doctor";
import { hook } from "./commands/hook";
import { login } from "./commands/login";
import { sync } from "./commands/sync";
import { loadConfig } from "./config";
import { readStdin } from "./input";
function options(args: string[]) {
  const values = new Map<string, string[]>();
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    const next = args[index + 1];
    const value =
      equals >= 0
        ? arg.slice(equals + 1)
        : next !== undefined && !next.startsWith("--")
          ? args[++index]!
          : "";
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return {
    rest,
    list: (name: string) => values.get(name),
    get: (name: string) => values.get(name)?.at(-1),
    has: (name: string) => values.has(name),
  };
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(
      "Open Hivemind (development)\n\nCommands: setup <url> [--token <pat>] [--root <dir>] [--exclude <dir>] [--read-only],\n          login --server <url> --token <pat>, doctor, hook [--dry-run], sync,\n          config <server-url>, skills [name]\nRead commands are under implementation.\nExit codes: 0 success, 1 empty, 2 usage/request error.",
    );
    return;
  }
  if (command === "--version") {
    console.log("0.1.0");
    return;
  }
  if (command === "skills") {
    const folder = resolve(import.meta.dirname, "../skills");
    const names = (await readdir(folder)).sort();
    if (args[0]) {
      if (!names.includes(args[0])) throw new Error("Unknown skill");
      console.log(await readFile(resolve(folder, args[0], "SKILL.md"), "utf8"));
    } else console.log(names.join("\n"));
    return;
  }
  if (command === "login" || command === "setup") {
    const flags = options(args);
    const server = command === "setup" ? flags.rest[0] : flags.get("server");
    if (!server || flags.rest.length > (command === "setup" ? 1 : 0))
      throw new Error(
        "Usage: openhivemind setup <url> [--token <pat>] [--root <dir>] [--exclude <dir>] [--read-only]",
      );
    const given = flags.get("token");
    const token = given && given !== "-" ? given : (await readStdin()).trim();
    if (!token) throw new Error("A personal access token is required: --token <pat> or on stdin");
    const config = await login({
      server,
      token,
      roots: flags.list("root"),
      exclude: flags.list("exclude"),
      ...(flags.has("read-only") ? { readOnly: true } : {}),
    });
    console.log(
      `Signed in to ${config.server}; state is namespaced by organisation ${config.org}.`,
    );
    if (command === "login") return;
  }
  if (command === "doctor" || command === "setup") {
    const report = await doctor();
    console.log(report.lines.join("\n"));
    if (!report.ok) process.exitCode = 2;
    return;
  }
  if (command === "hook") {
    await hook({ dryRun: args.includes("--dry-run") });
    return;
  }
  if (command === "sync" && !args.length) {
    const result = await sync(await loadConfig());
    console.log(
      result.skipped
        ? "Another uploader is running."
        : `Uploaded ${result.sent} chunk(s); ${result.pending} pending.`,
    );
    for (const error of new Set(result.errors)) console.error(error);
    if (result.errors.length) process.exitCode = 2;
    return;
  }
  if (command === "config" && args.length === 1) {
    console.log(JSON.stringify(await createApi(args[0]!)(routes.config), null, 2));
    return;
  }
  throw new Error("Unknown command or arguments; run openhivemind --help");
}
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 2;
}
