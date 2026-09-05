import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { createApi, routes, PROTOCOL_VERSION } from "@openhivemind/shared";
import { loadConfig, saveConfig, type Config } from "../config";
export interface LoginOptions {
  server: string;
  token: string;
  roots?: string[];
  exclude?: string[];
  readOnly?: boolean;
}
// Folder controls are stored resolved, so symlinks and worktrees cannot leak around them.
const realPaths = (paths: string[]) =>
  Promise.all(paths.map((path) => realpath(resolve(path)).catch(() => resolve(path))));
export async function login(options: LoginOptions): Promise<Config> {
  const server = options.server.replace(/\/$/, "");
  const info = await createApi(server)(routes.config);
  if (PROTOCOL_VERSION < info.protocol.minimum)
    throw new Error(`Server requires protocol ${info.protocol.minimum}; upgrade the client`);
  const org = await createApi(server, options.token)(routes.org);
  const previous = await loadConfig().catch(() => undefined);
  const config: Config = {
    ...previous,
    server,
    token: options.token,
    org: org.id,
    roots: await realPaths(options.roots ?? previous?.roots ?? []),
    exclude: await realPaths(options.exclude ?? previous?.exclude ?? []),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
  };
  await saveConfig(config);
  return config;
}
