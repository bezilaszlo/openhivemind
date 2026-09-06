import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import lockfile from "proper-lockfile";
import { ApiError, createApi, routes, type Chunk } from "@openhivemind/shared";
import {
  allowed,
  capture,
  readState,
  sessionFolder,
  type Envelope,
  type Event,
  type State,
} from "./capture";
import { children, refreshEvent } from "./harnesses/index";
import type { Config } from "./config";
import { atomic, stateRoot, upgradePath } from "./state";
export interface DrainOptions {
  transport?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
export interface DrainResult {
  sent: number;
  pending: number;
  errors: string[];
}
type Outcome =
  | { kind: "ok" }
  | { kind: "gone" }
  | { kind: "permanent"; detail: string; final: boolean }
  | { kind: "retry"; after?: number }
  | { kind: "upgrade"; detail: string };
const ATTEMPTS = 4;
const REJECTIONS = 3;
const LONG_WAIT = 30000;
type Api = ReturnType<typeof createApi>;
async function send(api: Api, externalId: string, chunk: Chunk): Promise<Outcome> {
  try {
    await api(routes.ingest, { params: { externalId }, body: chunk });
    return { kind: "ok" };
  } catch (error) {
    if (!(error instanceof ApiError)) return { kind: "retry" };
    if (error.status === 410) return { kind: "gone" };
    if (error.status === 426) return { kind: "upgrade", detail: error.message };
    if (error.status === 429) {
      const header = Number(error.headers.get("retry-after"));
      return { kind: "retry", ...(Number.isFinite(header) && header > 0 ? { after: header } : {}) };
    }
    if (error.status >= 500) return { kind: "retry" };
    // 403 is another developer's session: never retried, the chunk is dead on arrival.
    return { kind: "permanent", detail: `HTTP ${error.status}`, final: error.status === 403 };
  }
}
// Chunks leave the spool only on 202 or 410; anything ambiguous is replayed and absorbed by revisions.
async function deliver(
  api: Api,
  path: string,
  envelope: Envelope,
  externalId: string,
  options: DrainOptions,
): Promise<{ sent: number; outcome: Outcome }> {
  const sleep = options.sleep ?? ((ms: number) => delay(ms));
  const remaining = [...envelope.chunks];
  let sent = 0;
  let outcome: Outcome = { kind: "ok" };
  while (remaining.length) {
    for (let attempt = 0; ; attempt++) {
      outcome = await send(api, externalId, remaining[0]!);
      if (outcome.kind !== "retry") break;
      const wait = outcome.after === undefined ? 500 * 2 ** attempt : outcome.after * 1000;
      if (attempt + 1 >= ATTEMPTS || wait > LONG_WAIT) break;
      await sleep(wait);
    }
    if (outcome.kind !== "ok") break;
    remaining.shift();
    sent++;
  }
  if (!remaining.length) {
    // Only an acknowledged chunk makes the local session eligible for later metadata-only
    // completion/title updates. This prevents a metadata-only empty transcript from ever
    // creating a server-side session.
    await atomic(join(dirname(path), "state.json"), { ...envelope.after, published: true });
    await rm(path, { force: true });
  } else if (sent || outcome.kind === "permanent")
    await atomic(path, {
      ...envelope,
      chunks: remaining,
      ...(outcome.kind === "permanent" ? { attempts: (envelope.attempts ?? 0) + 1 } : {}),
    });
  return { sent, outcome };
}
async function outstanding(event: Event, config: Config): Promise<boolean> {
  const info = await stat(event.transcriptPath).catch(() => undefined);
  if (!info) return false;
  const state = (await readFile(
    join(sessionFolder(config, event.source, event.sessionId), "state.json"),
    "utf8",
  ).catch(() => undefined)) as string | undefined;
  if (!state) return true;
  const known = JSON.parse(state) as State;
  return info.size > known.offset || info.ino !== known.inode;
}
async function dropSession(folder: string, state: State) {
  for (const name of await readdir(folder))
    if (name.endsWith(".batch.json")) await rm(join(folder, name), { force: true });
  await atomic(join(folder, "state.json"), { ...state, tombstoned: true });
}
export async function drain(
  config: Config,
  options: DrainOptions = {},
  resumed = false,
): Promise<DrainResult> {
  const root = stateRoot(config);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const api = createApi(config.server, config.token, options.transport);
  const errors: string[] = [];
  let sent = 0;
  let stopped = false;
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((file) => file.isFile() && file.name.endsWith(".batch.json"))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const item of files) {
    if (stopped) break;
    const path = join(item.parentPath, item.name);
    let release: () => Promise<void>;
    try {
      release = await lockfile.lock(item.parentPath, { stale: 10000, update: 3000, retries: 0 });
    } catch {
      continue;
    }
    try {
      const envelope = JSON.parse(await readFile(path, "utf8")) as Envelope;
      const event = envelope.after.event;
      if (!(await allowed(event.cwd, config))) {
        errors.push("excluded pending session");
        continue;
      }
      // Reconcile before acknowledgements remove the only recovery record.
      const state = await readState(item.parentPath, event);
      if (envelope.after.generation > state.generation)
        await atomic(join(item.parentPath, "state.json"), envelope.after);
      const result = await deliver(api, path, envelope, event.sessionId, options);
      sent += result.sent;
      if (result.outcome.kind === "gone") await dropSession(item.parentPath, envelope.after);
      if (result.outcome.kind === "upgrade") {
        await atomic(upgradePath(config), {
          detail: result.outcome.detail,
          at: new Date().toISOString(),
        });
        errors.push("upgrade client");
        stopped = true;
      }
      if (result.outcome.kind === "permanent") {
        const attempts = (envelope.attempts ?? 0) + 1;
        errors.push(result.outcome.detail);
        if (result.outcome.final || attempts >= REJECTIONS) {
          await rename(path, path + ".dead");
          errors.push("chunk rejected permanently");
        }
      }
      // A run of failures is the server being unavailable: leave the rest for the next drain.
      if (result.outcome.kind === "retry") {
        errors.push("upload postponed");
        stopped = true;
      }
    } catch (error) {
      errors.push(
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "upload failed",
      );
    } finally {
      await release();
    }
  }
  const states = (await readdir(root, { recursive: true, withFileTypes: true })).filter(
    (file) => file.isFile() && file.name === "state.json",
  );
  let restarted = false;
  for (const item of states) {
    const path = join(item.parentPath, item.name);
    const state = JSON.parse(await readFile(path, "utf8")) as State;
    const event = await refreshEvent(state.event);
    // The last turn of a session is written after its own hook read the transcript, so the
    // drain path is what closes the tail; paused sessions resume here once the cap is freed.
    const behind = await stat(event.transcriptPath).then(
      (info) => info.size > state.offset || info.ino !== state.inode,
      () => false,
    );
    // capture() is a no-op at EOF unless the refreshed title differs, so this also repairs
    // already-spooled sessions without creating noise for unchanged ones.
    if (state.paused || behind || event.title !== state.event.title) {
      try {
        restarted = (await capture(event, config)).chunks > 0 || restarted;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
          await atomic(path, { ...state, gap: true });
        else errors.push("recapture failed");
      }
    }
    // Subagents that only appeared, or grew, after the session's last hook.
    for (const child of await children(event)) {
      if (!(await outstanding(child, config))) continue;
      try {
        restarted = (await capture(child, config)).chunks > 0 || restarted;
      } catch {
        errors.push("recapture failed");
      }
    }
  }
  if (!resumed && !stopped && restarted) {
    const next = await drain(config, options, true);
    return { sent: sent + next.sent, pending: next.pending, errors: [...errors, ...next.errors] };
  }
  return {
    sent,
    pending: (await readdir(root, { recursive: true })).filter((name) =>
      name.endsWith(".batch.json"),
    ).length,
    errors,
  };
}
