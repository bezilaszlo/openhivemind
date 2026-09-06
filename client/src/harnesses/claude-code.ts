import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Event } from "../capture";
// Claude Code 2.1.259 hook stdin: session_id, transcript_path, cwd, hook_event_name (+ fields we ignore).
// Stop is the turn event; SessionEnd closes the session. Anything else is not a capture trigger.
export function claudeCodeEvent(input: unknown): Event | undefined {
  if (!input || typeof input !== "object") throw new Error("Hook input is not an object");
  const value = input as Record<string, unknown>;
  const event = value["hook_event_name"];
  if (event !== "Stop" && event !== "SessionEnd") return undefined;
  const [sessionId, transcriptPath, cwd] = ["session_id", "transcript_path", "cwd"].map((name) => {
    const field = value[name];
    if (typeof field !== "string" || !field) throw new Error(`Hook input is missing ${name}`);
    return field;
  }) as [string, string, string];
  return {
    sessionId,
    transcriptPath,
    cwd,
    source: "claude-code",
    ...(event === "SessionEnd" ? { completed: true } : {}),
  };
}

interface AgentMeta {
  description?: string;
  spawnDepth?: number;
  model?: string;
}
// Claude Code keeps every subagent flat under `<project>/<session>/subagents/`, nested ones
// included; spawnDepth is the only nesting signal we forward, the parent stays the root session.
export async function claudeCodeChildren(event: Event): Promise<Event[]> {
  const folder = join(dirname(event.transcriptPath), event.sessionId, "subagents");
  const names = (await readdir(folder).catch(() => [])).filter((name) =>
    /^agent-.+\.jsonl$/.test(name),
  );
  const children: Event[] = [];
  for (const name of names.sort()) {
    const agentId = name.slice("agent-".length, -".jsonl".length);
    const meta = JSON.parse(
      await readFile(join(folder, name.replace(/\.jsonl$/, ".meta.json")), "utf8").catch(
        () => "{}",
      ),
    ) as AgentMeta;
    children.push({
      sessionId: `${event.sessionId}:${agentId}`,
      transcriptPath: join(folder, name),
      cwd: event.cwd,
      source: event.source,
      parentId: event.sessionId,
      spawnDepth: Number(meta.spawnDepth) || 1,
      ...(meta.description ? { title: meta.description } : {}),
      ...(meta.model ? { modelExplicit: meta.model } : {}),
      ...(event.completed ? { completed: true } : {}),
    });
  }
  return children;
}
// A transcript this stale is treated as a finished conversation; a fresher one beams without
// the flag and is left for its own hook to close out, since the server's completed merge is
// monotonic and would otherwise mark a still-live session finished forever.
const COMPLETED_AFTER_MS = 10 * 60 * 1000;
// beam accepts a transcript path directly, or a bare session id resolved against every
// project directory Claude Code keeps under ~/.claude/projects.
export async function claudeCodeLocate(input: string): Promise<Event | undefined> {
  let transcriptPath = input;
  if (!input.endsWith(".jsonl")) {
    if (!/^[0-9a-f-]{8,}$/i.test(input)) return undefined;
    const root = join(homedir(), ".claude/projects");
    const projects = await readdir(root).catch(() => []);
    const candidates = (
      await Promise.all(
        projects.map(async (project) => {
          const path = join(root, project, input + ".jsonl");
          return (await stat(path).catch(() => undefined)) ? path : undefined;
        }),
      )
    ).filter((path): path is string => path !== undefined);
    if (!candidates.length) return undefined;
    // The project directory is derived from a cwd, not the session id, so the same id can
    // legitimately exist under two of them; beam must not silently guess which one.
    if (candidates.length > 1)
      throw new Error(
        `Session id ${input} exists under more than one project: ${candidates.join(", ")}`,
      );
    transcriptPath = candidates[0]!;
  } else if (basename(dirname(transcriptPath)) === "subagents") {
    // A subagent's own transcript is never a root session; beaming it directly would double it
    // up under two ids, its own and again as a child once its root session is beamed.
    throw new Error(`${transcriptPath} is a subagent transcript; beam its root session instead`);
  }
  const info = await stat(transcriptPath).catch(() => undefined);
  if (!info) return undefined;
  const sessionId = basename(transcriptPath, ".jsonl");
  let lines: string[];
  try {
    lines = (await readFile(transcriptPath, "utf8")).split("\n").filter(Boolean);
  } catch (error) {
    throw new Error(
      `Could not read ${transcriptPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let cwd: string | undefined;
  for (const line of lines.slice(0, 20)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record["cwd"] === "string") {
        cwd = record["cwd"];
        break;
      }
    } catch {
      // One bad line does not doom the lookup; a later line may still carry a cwd.
      continue;
    }
  }
  if (!cwd) throw new Error(`No cwd recorded in the first lines of ${transcriptPath}`);
  const completed = Date.now() - info.mtimeMs > COMPLETED_AFTER_MS;
  return {
    sessionId,
    transcriptPath,
    cwd,
    source: "claude-code",
    ...(completed ? { completed: true } : {}),
  };
}
