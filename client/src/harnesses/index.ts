import { basename } from "node:path";
import type { Event } from "../capture";
import { claudeCodeChildren, claudeCodeEvent, claudeCodeTitle } from "./claude-code";
import { codexChildren, codexEvent, codexTitle } from "./codex";
const ROLLOUT = /^rollout-.+\.jsonl$/;
// Both harnesses send the same four locator fields, so the transcript name decides: Codex writes
// `rollout-<timestamp>-<threadId>.jsonl` and may send none at all, Claude Code always sends
// `<sessionId>.jsonl`.
export function hookEvent(input: unknown): Promise<Event | undefined> {
  const path = (input as Record<string, unknown> | null)?.["transcript_path"];
  const codex = typeof path !== "string" || !path || ROLLOUT.test(basename(path));
  return codex ? codexEvent(input) : Promise.resolve(claudeCodeEvent(input));
}
// Child transcripts a harness writes beside the session; the adapter only locates them.
export function children(event: Event): Promise<Event[]> {
  if (event.parentId) return Promise.resolve([]);
  if (event.source === "claude-code") return claudeCodeChildren(event);
  return event.source === "codex" ? codexChildren(event) : Promise.resolve([]);
}
// The Codex resume-menu title is stored outside its append-only rollout. Refresh it while
// draining so an already-captured session can receive a metadata-only improvement.
export async function refreshEvent(event: Event): Promise<Event> {
  if (event.parentId) return event;
  const title =
    event.source === "codex"
      ? await codexTitle(event.sessionId)
      : event.source === "claude-code"
        ? await claudeCodeTitle(event.transcriptPath)
        : undefined;
  return title ? { ...event, title } : event;
}
