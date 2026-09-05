import { mkdir } from "node:fs/promises";
import lockfile from "proper-lockfile";
import { drain, type DrainOptions } from "../upload";
import type { Config } from "../config";
import { stateRoot } from "../state";
const uploaderLock = { stale: 60000, update: 10000, retries: 0 };
// One uploader per server and organisation; capture keeps its own per-session lock.
export async function uploaderRunning(config: Config): Promise<boolean> {
  const root = stateRoot(config);
  await mkdir(root, { recursive: true, mode: 0o700 });
  return lockfile.check(root, uploaderLock);
}
export async function sync(
  config: Config,
  options: DrainOptions = {},
): Promise<{
  sent: number;
  pending: number;
  errors: string[];
  skipped?: true;
}> {
  const root = stateRoot(config);
  await mkdir(root, { recursive: true, mode: 0o700 });
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(root, uploaderLock);
  } catch {
    return { sent: 0, pending: 0, errors: [], skipped: true };
  }
  try {
    return await drain(config, options);
  } finally {
    await release();
  }
}
