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
