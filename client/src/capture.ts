import { mkdir, readFile, open, readdir, stat, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, relative, isAbsolute, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import lockfile from "proper-lockfile";
import {
  normalizeRemote,
  parseRecords,
  scrubValue,
  ignorePatterns,
  type ParsedMessage,
  type Meta,
  type Chunk,
  type Message,
} from "@openhivemind/shared";
import { atomic, digest, stateRoot } from "./state";
import type { Config } from "./config";
const exec = promisify(execFile);
export interface Event {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  source: Meta["source"];
  version?: string;
  completed?: boolean;
  parentId?: string;
  spawnDepth?: number;
  title?: string;
  modelExplicit?: string;
}
export interface State {
  generation: number;
  offset: number;
  inode: number;
  recordIndex: number;
  nextSeq: number;
  entries: Record<string, { seq: number; rev: number; hash: string }>;
  pending: ParsedMessage[];
  seenUsage: string[];
  model?: string;
  start?: number;
  meta?: Meta;
  paused?: boolean;
  gap?: boolean;
  event: Event;
}
export interface Envelope {
  chunks: Chunk[];
  after: State;
  attempts?: number;
}
function inside(path: string, root: string) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel));
}
export async function allowed(cwd: string, config: Config) {
  const path = await realpath(cwd);
  const resolveAll = (paths: string[]) => Promise.all(paths.map((path) => realpath(resolve(path))));
  const [roots, exclude] = await Promise.all([
    resolveAll(config.roots),
    resolveAll(config.exclude),
  ]);
  return (
    !exclude.some((root) => inside(path, root)) &&
    (!roots.length || roots.some((root) => inside(path, root)))
  );
}
async function patterns(cwd: string) {
  const result: RegExp[] = [];
  let root = cwd;
  try {
    root = (
      await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 5000 })
    ).stdout.trim();
  } catch {}
  for (const path of [
    join(root, ".openhivemind-ignore"),
    join(homedir(), ".config/openhivemind/ignore"),
  ]) {
    try {
      result.push(...ignorePatterns(await readFile(path, "utf8")));
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  }
  return result;
}
export async function readState(folder: string, event: Event): Promise<State> {
  try {
    return JSON.parse(await readFile(join(folder, "state.json"), "utf8")) as State;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
    return {
      generation: 0,
      offset: 0,
      inode: 0,
      recordIndex: 0,
      nextSeq: 1,
      entries: {},
      pending: [],
      seenUsage: [],
      event,
    };
  }
}
export const sessionFolder = (config: Config, source: string, sessionId: string) =>
  join(stateRoot(config), source, digest(sessionId));
// Statuses capture() returns before ever touching the spool; the hook and beam both use this
// to decide whether it is worth starting an uploader or capturing this event's children.
const UNSPOOLED_STATUSES = new Set(["excluded", "no origin", "sensitive locator"]);
export const wasSpooled = (status: string): boolean => !UNSPOOLED_STATUSES.has(status);
export interface CaptureOptions {
  dryRun?: boolean;
  afterChunk?: () => Promise<void>;
  // Read window per call, for tests exercising a transcript larger than one read; production
  // callers rely on the 16 MiB default.
  readWindow?: number;
}
export async function capture(
  event: Event,
  config: Config,
  options: CaptureOptions = {},
): Promise<{ status: string; chunks: number; bytes: number; payloads?: Chunk[] }> {
  if (config.readOnly || !(await allowed(event.cwd, config)))
    return { status: "excluded", chunks: 0, bytes: 0 };
  let remote: string;
  try {
    remote = normalizeRemote(
      (
        await exec("git", ["-C", event.cwd, "remote", "get-url", "origin"], {
          timeout: 5000,
          maxBuffer: 65536,
        })
      ).stdout,
    );
  } catch {
    return { status: "no origin", chunks: 0, bytes: 0 };
  }
  const extra = await patterns(event.cwd);
  // Only the locator has to be clean here; free-form fields are scrubbed with the metadata.
  const locator = {
    sessionId: event.sessionId,
    transcriptPath: event.transcriptPath,
    cwd: event.cwd,
    parentId: event.parentId,
  };
  if (JSON.stringify(scrubValue(locator, extra)) !== JSON.stringify(locator))
    return { status: "sensitive locator", chunks: 0, bytes: 0 };
  const root = stateRoot(config);
  const folder = sessionFolder(config, event.source, event.sessionId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(folder, {
    stale: 10000,
    update: 3000,
    retries: { retries: 3, minTimeout: 25, maxTimeout: 100 },
  });
  try {
    let state = await readState(folder, event);
    const files = (await readdir(folder)).filter((name) => name.endsWith(".batch.json")).sort();
    for (const name of files) {
      const envelope = JSON.parse(await readFile(join(folder, name), "utf8")) as Envelope;
      if (envelope.after.generation > state.generation) state = envelope.after;
    }
    const info = await stat(event.transcriptPath);
    const restart = info.ino !== state.inode || info.size < state.offset;
    const offset = restart ? 0 : state.offset;
    const file = await open(event.transcriptPath, "r");
    let buffer: Buffer;
    try {
      buffer = Buffer.alloc(Math.min(info.size - offset, options.readWindow ?? 16 * 1024 * 1024));
      const result = await file.read(buffer, 0, buffer.length, offset);
      buffer = buffer.subarray(0, result.bytesRead);
    } finally {
      await file.close();
    }
    const end = buffer.lastIndexOf(10);
    // No newline anywhere in a full window (as opposed to a short final read that reached the
    // end of the file) means one line is longer than the window itself: capture cannot make any
    // progress here, ever, and must not be mistaken for the ordinary case of a not-yet-finished
    // trailing line. This returns before the closing check below, so a SessionEnd hook on such a
    // transcript defers delivering its completed flag until the oversized line is resolved.
    if (end < 0 && offset + buffer.length < info.size)
      return { status: "line exceeds window", chunks: 0, bytes: 0 };
    // A session-end after the last turn still has to deliver the completed flag.
    const closing = Boolean(event.completed) && Boolean(state.meta) && !state.meta?.completed;
    if (end < 0 && !closing) return { status: "no complete records", chunks: 0, bytes: 0 };
    const lines = buffer
      .subarray(0, end + 1)
      .toString("utf8")
      .split("\n")
      .filter(Boolean);
    const records = lines.map((line) => JSON.parse(line) as unknown);
    const parsed = parseRecords(event.source, records, {
      messages: restart ? [] : state.pending,
      seenUsage: restart ? [] : state.seenUsage,
      indexOffset: restart ? 0 : state.recordIndex,
      model: state.model,
      ...(restart ? {} : { start: state.start }),
    });
    const safe = scrubValue(parsed, extra) as typeof parsed;
    const meta = scrubValue(
      {
        ...state.meta,
        ...safe.meta,
        source: event.source,
        version: event.version ?? safe.meta.version ?? state.meta?.version ?? "unknown",
        remote,
        cwd: event.cwd,
        branch: safe.meta.branch ?? state.meta?.branch ?? "",
        branches: [...new Set([...(state.meta?.branches ?? []), safe.meta.branch ?? ""])],
        title:
          state.meta?.title ??
          event.title ??
          safe.messages.find((message) => message.kind === "prompt")?.text.slice(0, 4096) ??
          "Untitled session",
        started_at: state.meta?.started_at ?? safe.messages[0]?.ts ?? new Date().toISOString(),
        completed: Boolean(state.meta?.completed || event.completed),
        spawn_depth: state.meta?.spawn_depth ?? event.spawnDepth ?? 0,
        ...((state.meta?.model_explicit ?? event.modelExplicit)
          ? { model_explicit: state.meta?.model_explicit ?? event.modelExplicit }
          : {}),
        models: [
          ...new Set([
            ...(state.meta?.models ?? []),
            ...safe.messages.flatMap((message) => (message.model ? [message.model] : [])),
          ]),
        ],
        ...(event.parentId ? { parent_external_id: event.parentId } : {}),
      },
      extra,
    ) as Meta;
    const entries = { ...state.entries };
    const messages: Message[] = [];
    let nextSeq = state.nextSeq;
    for (const message of safe.messages) {
      const parts: string[] = [];
      let text = message.text;
      while (Buffer.byteLength(text) > 60000) {
        let length = Math.min(text.length, 15000);
        if (/[\uD800-\uDBFF]/.test(text[length - 1] ?? "")) length--;
        parts.push(text.slice(0, length));
        text = text.slice(length);
      }
      parts.push(text);
      for (const [partIndex, text] of parts.entries()) {
        const key = digest(message.source_event_id + ":" + partIndex);
        const data = {
          ...message,
          text,
          source_event_id: key,
          ...(parts.length > 1 ? { truncated: true } : {}),
          ...(partIndex > 0 ? { usage: null } : {}),
        };
        const hash = digest(JSON.stringify(data));
        const prior = entries[key];
        if (prior?.hash === hash) continue;
        const entry = { seq: prior?.seq ?? nextSeq++, rev: (prior?.rev ?? 0) + 1, hash };
        entries[key] = entry;
        messages.push({ ...data, seq: entry.seq, rev: entry.rev });
      }
    }
    const after: State = {
      generation: state.generation + 1,
      offset: offset + end + 1,
      inode: info.ino,
      recordIndex: (restart ? 0 : state.recordIndex) + records.length,
      nextSeq,
      entries,
      pending: safe.messages.slice(-16),
      seenUsage: safe.state.seenUsage,
      model: safe.state.model,
      start: safe.state.start,
      meta,
      event,
      paused: false,
    };
    const payloads: Chunk[] = [];
    let batch: Message[] = [];
    for (const message of messages) {
      if (batch.length >= 500 || Buffer.byteLength(JSON.stringify([...batch, message])) > 1500000) {
        payloads.push({ protocolVersion: 1, chunkId: randomUUID(), meta, messages: batch });
        batch = [];
      }
      batch.push(message);
    }
    if (batch.length || state.meta?.completed !== meta.completed)
      payloads.push({ protocolVersion: 1, chunkId: randomUUID(), meta, messages: batch });
    if (options.dryRun) return { status: "dry run", chunks: payloads.length, bytes: 0, payloads };
    // One envelope carries all chunks from a capture, so recovery cannot skip a partly-spooled batch.
    const envelope = { chunks: payloads, after };
    const serialized = JSON.stringify(envelope);
    const pendingSize = await spoolBytes(root);
    if (pendingSize + Buffer.byteLength(serialized) > (config.spoolLimit ?? 256 * 1024 * 1024)) {
      await atomic(join(folder, "state.json"), { ...state, event, paused: true });
      return { status: "paused", chunks: 0, bytes: 0 };
    }
    if (payloads.length) {
      await atomic(
        join(folder, String(after.generation).padStart(16, "0") + ".batch.json"),
        envelope,
      );
      await options.afterChunk?.();
    }
    await atomic(join(folder, "state.json"), after);
    return {
      status: "captured",
      chunks: payloads.length,
      bytes: payloads.length ? Buffer.byteLength(serialized) : 0,
    };
  } finally {
    await release();
  }
}
export async function spoolBytes(root: string): Promise<number> {
  let total = 0;
  for (const file of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith(".batch.json"))
      total += (await stat(join(file.parentPath, file.name))).size;
  }
  return total;
}
