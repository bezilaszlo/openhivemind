import type { Event } from "../capture";
import { claudeCodeChildren } from "./claude-code";
export { claudeCodeEvent } from "./claude-code";
// Child transcripts a harness writes beside the session; the adapter only locates them.
export function children(event: Event): Promise<Event[]> {
  if (event.parentId) return Promise.resolve([]);
  return event.source === "claude-code" ? claudeCodeChildren(event) : Promise.resolve([]);
}
