import { appendFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const stateHome = () => join(homedir(), ".local/state/openhivemind");
export const stateRoot = (config: { server: string; org: string }) =>
  join(stateHome(), digest(config.server + "/" + config.org).slice(0, 24));
export interface Upgrade {
  detail: string;
  at: string;
}
// Set by the uploader when the server refuses this protocol version; cleared by a client upgrade.
export const upgradePath = (config: { server: string; org: string }) =>
  join(stateRoot(config), "upgrade.json");
export async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await rm(temp, { force: true });
  }
}
// Timestamps, session ids, byte counts and error classes only; never transcript text or tokens.
export async function log(fields: Record<string, string | number>) {
  const home = stateHome();
  await mkdir(home, { recursive: true, mode: 0o700 });
  const path = join(home, "hook.log");
  const size = await stat(path).then(
    (info) => info.size,
    () => 0,
  );
  if (size > 1024 * 1024) await rename(path, path + ".1");
  const line = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, "_")}`)
    .join(" ");
  await appendFile(path, new Date().toISOString() + " " + line + "\n", { mode: 0o600 });
}
export function errorClass(error: unknown): string {
  if (error && typeof error === "object") {
    if ("status" in error && typeof error.status === "number") return "http-" + error.status;
    if ("code" in error) return String(error.code);
  }
  return error instanceof Error ? error.name : "unknown";
}
