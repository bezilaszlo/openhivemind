import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomic } from "./state";
export interface Config {
  server: string;
  token: string;
  org: string;
  roots: string[];
  exclude: string[];
  readOnly?: boolean;
  spoolLimit?: number;
}
export const configPath = () => join(homedir(), ".config/openhivemind/config.json");
export const NOT_CONFIGURED =
  "No hive configured. Connect this machine with the token on stdin: wl-paste | openhivemind setup <url> (pbpaste on macOS).";
// A missing file is the fresh-machine case and gets the setup hint; a present but broken file is
// something else and must not be mistaken for it.
export async function loadConfig(): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(NOT_CONFIGURED);
    throw error;
  }
  let value: Config;
  try {
    value = JSON.parse(raw) as Config;
  } catch {
    throw new Error(`Invalid configuration at ${configPath()}; run openhivemind setup <url> again`);
  }
  if (
    !value ||
    typeof value.server !== "string" ||
    typeof value.token !== "string" ||
    typeof value.org !== "string" ||
    !Array.isArray(value.roots) ||
    !Array.isArray(value.exclude)
  )
    throw new Error(`Invalid configuration at ${configPath()}; run openhivemind setup <url> again`);
  return value;
}
export async function saveConfig(config: Config): Promise<void> {
  await atomic(configPath(), config);
}
