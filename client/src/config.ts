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
export async function loadConfig(): Promise<Config> {
  const value = JSON.parse(await readFile(configPath(), "utf8")) as Config;
  if (
    !value ||
    typeof value.server !== "string" ||
    typeof value.token !== "string" ||
    typeof value.org !== "string" ||
    !Array.isArray(value.roots) ||
    !Array.isArray(value.exclude)
  )
    throw new Error("Invalid configuration; run setup");
  return value;
}
export async function saveConfig(config: Config): Promise<void> {
  await atomic(configPath(), config);
}
