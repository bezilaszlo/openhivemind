#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApi, routes } from "@openhivemind/shared";
import { beam } from "./commands/beam";
import { doctor } from "./commands/doctor";
import { hook } from "./commands/hook";
import { login } from "./commands/login";
import { sync } from "./commands/sync";
import { loadConfig } from "./config";
import { readStdin } from "./input";
import { options } from "./args";
import { search } from "./commands/search";
import { sessions } from "./commands/sessions";
import { show } from "./commands/show";
// Injected by tsup from package.json, so the version lives in one place.
declare const __OHM_VERSION__: string;
function emit(result: { lines: string[]; exitCode: number }) {
  const text = result.lines.join("\n");
  if (result.exitCode === 2) console.error(text);
  else console.log(text);
  process.exitCode = result.exitCode;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(
      "Open Hivemind (development)\n\nCommands: setup <url> [--token <pat>] [--root <dir>] [--exclude <dir>] [--read-only],\n          login --server <url> --token <pat>, doctor, hook [--dry-run], sync,\n          beam <transcript.jsonl|session-id>, config <server-url>, skills [name],\n          search <query...> [--remote --author --branch --since --until --kind --mine --limit --context --regex --case-sensitive --format plain|md],\n          sessions [--remote --author --branch --since --until --kind --mine --days N --limit --format plain|md],\n          show <session-id> [--last N --match <text> --regex <pattern> --context N --format plain|md]\nExit codes: 0 success, 1 empty, 2 usage/request error.",
    );
    return;
  }
  if (command === "--version") {
    console.log(__OHM_VERSION__);
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
    // A hidden prompt swallows the paste in some terminals and --token lands in shell history, so
    // the token is piped; an open terminal with nothing piped would otherwise wait in silence.
    if (!given && process.stdin.isTTY)
      throw new Error(
        `Pipe the token in: wl-paste | openhivemind ${command} ${command === "setup" ? "<url>" : "--server <url>"} (pbpaste on macOS), or pass --token <pat>`,
      );
    const token = given && given !== "-" ? given : (await readStdin()).trim();
    if (!token)
      throw new Error("A personal access token is required on stdin or via --token <pat>");
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
  if (command === "beam") {
    if (args.length !== 1)
      throw new Error("Usage: openhivemind beam <transcript.jsonl|session-id>");
    const result = await beam(args[0]!, await loadConfig());
    console.log(
      `${result.sessionId}: ${result.status}, ${result.chunks} chunk(s), ${result.children} subagent(s) captured; ` +
        (result.uploaded.skipped
          ? "another uploader is running; nothing sent from beam."
          : `uploaded ${result.uploaded.sent}, ${result.uploaded.pending} pending.`),
    );
    for (const error of new Set(result.uploaded.errors)) console.error(error);
    if (result.uploaded.errors.length) process.exitCode = 2;
    return;
  }
  if (command === "search") {
    emit(await search(await loadConfig(), options(args)));
    return;
  }
  if (command === "sessions") {
    emit(await sessions(await loadConfig(), options(args)));
    return;
  }
  if (command === "show") {
    emit(await show(await loadConfig(), options(args)));
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
