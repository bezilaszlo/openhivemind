import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import type { Event } from "../capture";
// A rollout's first line carries session_meta and can be tens of kilobytes of base instructions.
const FIRST_LINE = 64 * 1024;
const ROLLOUT = /^rollout-.+\.jsonl$/;
const sessionsRoot = () => join(process.env["CODEX_HOME"] || join(homedir(), ".codex"), "sessions");
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
interface Rollout {
  id?: string;
  parent?: string;
  cwd?: string;
  title?: string;
}
// The child's own session_meta is the first line and the parent's is copied in below it, so only
// the first record is ever read. A subagent is handed its task over an encrypted channel and
// never as a prompt, so the agent path Codex names it by is the only title it will ever have.
async function meta(path: string): Promise<Rollout> {
  const file = await open(path, "r");
  let text: string;
  try {
    const buffer = Buffer.alloc(FIRST_LINE);
    const result = await file.read(buffer, 0, FIRST_LINE, 0);
    text = buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
  const end = text.indexOf("\n");
  if (end < 0) return {};
  let payload: Record<string, unknown>;
  try {
    const data = record(JSON.parse(text.slice(0, end)) as unknown);
    if (data.type !== "session_meta") return {};
    payload = record(data.payload);
  } catch {
    return {};
  }
  const name = payload.agent_path ?? payload.agent_nickname;
  return {
    ...(typeof payload.id === "string" ? { id: payload.id } : {}),
    ...(typeof payload.session_id === "string" && payload.session_id !== payload.id
      ? { parent: payload.session_id }
      : {}),
    ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    ...(typeof name === "string" && name ? { title: name } : {}),
  };
}
// 0.153.4 populates transcript_path despite the docs; the filename carries the thread id either way.
async function findRollout(sessionId: string): Promise<string | undefined> {
  const root = sessionsRoot();
  const files = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const match = files.find(
    (file) => file.isFile() && ROLLOUT.test(file.name) && file.name.endsWith(`-${sessionId}.jsonl`),
  );
  return match && join(match.parentPath, match.name);
}
// Codex CLI 0.153.4 hook stdin: session_id, transcript_path (nullable), cwd, hook_event_name.
// Stop is the turn event; SessionEnd closes the session and is capped at 3 s, so it only spools.
export async function codexEvent(input: unknown): Promise<Event | undefined> {
  if (!input || typeof input !== "object") throw new Error("Hook input is not an object");
  const value = input as Record<string, unknown>;
  const name = value["hook_event_name"];
  if (name !== "Stop" && name !== "SessionEnd") return undefined;
  const [sessionId, cwd] = ["session_id", "cwd"].map((field) => {
    const item = value[field];
    if (typeof item !== "string" || !item) throw new Error(`Hook input is missing ${field}`);
    return item;
  }) as [string, string];
  const given = value["transcript_path"];
  const transcriptPath = typeof given === "string" && given ? given : await findRollout(sessionId);
  if (!transcriptPath) throw new Error("No rollout file for this Codex session");
  return {
    sessionId,
    transcriptPath,
    cwd,
    source: "codex",
    ...(name === "SessionEnd" ? { completed: true } : {}),
  };
}
// Rollouts live in a local-date directory, so a thread running past midnight spawns its later
// children into the next one.
function days(folder: string): string[] {
  const parts = folder.split(sep);
  const [year, month, day] = parts.slice(-3);
  if (!/^\d{4}$/.test(year ?? "") || !/^\d{2}$/.test(month ?? "") || !/^\d{2}$/.test(day ?? ""))
    return [folder];
  const next = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1));
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    folder,
    join(
      parts.slice(0, -3).join(sep),
      String(next.getUTCFullYear()),
      pad(next.getUTCMonth() + 1),
      pad(next.getUTCDate()),
    ),
  ];
}
// Subagent and guardian threads are separate rollouts whose session_meta.session_id is the
// parent thread; their own id is already globally unique.
export async function codexChildren(event: Event): Promise<Event[]> {
  const own = basename(event.transcriptPath);
  const children: Event[] = [];
  for (const folder of days(dirname(event.transcriptPath))) {
    const names = (await readdir(folder).catch(() => []))
      .filter((name) => name !== own && ROLLOUT.test(name))
      .sort();
    for (const name of names) {
      const path = join(folder, name);
      const child = await meta(path);
      if (!child.id || child.parent !== event.sessionId) continue;
      children.push({
        sessionId: child.id,
        transcriptPath: path,
        cwd: child.cwd ?? event.cwd,
        source: event.source,
        parentId: event.sessionId,
        spawnDepth: 1,
        ...(child.title ? { title: child.title } : {}),
        ...(event.completed ? { completed: true } : {}),
      });
    }
  }
  return children;
}
