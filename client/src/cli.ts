#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApi, routes } from "@openhivemind/shared";
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(
      "Open Hivemind (development)\n\nCommands: config <server-url>, skills [name]\nCapture and read commands are under implementation.\nExit codes: 0 success, 1 empty, 2 usage/request error.",
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
