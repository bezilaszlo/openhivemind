import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
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
