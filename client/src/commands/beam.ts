import { stat } from "node:fs/promises";
import {
  capture,
  readState,
  sessionFolder,
  wasSpooled,
  type CaptureOptions,
  type Event,
} from "../capture";
import { claudeCodeLocate } from "../harnesses/claude-code";
import { children } from "../harnesses/index";
import type { Config } from "../config";
import type { DrainOptions } from "../upload";
import { sync } from "./sync";
export interface BeamResult {
  sessionId: string;
  status: string;
  chunks: number;
  children: number;
  uploaded: { sent: number; pending: number; errors: string[]; skipped?: true };
}
// capture() only ever reads one bounded window per call, relying on the next hook to finish the
// job; beam has no next call coming, so it has to keep capturing until the transcript's whole
// size is spooled (or capture stops making progress on its own, e.g. no complete records left).
async function captureAll(event: Event, config: Config, options: CaptureOptions = {}) {
  let chunks = 0;
  let bytes = 0;
  let status: string;
  for (;;) {
    const result = await capture(event, config, options);
    chunks += result.chunks;
    bytes += result.bytes;
    status = result.status;
    // A single line wider than the read window can never make progress; failing loudly here
    // beats leaving the offset stuck for every later hook too.
    if (status === "line exceeds window")
      throw new Error(
        `${event.transcriptPath} has a line longer than the capture read window; beam cannot continue`,
      );
    if (status !== "captured") break;
    const info = await stat(event.transcriptPath).catch(() => undefined);
    if (!info) break;
    const state = await readState(sessionFolder(config, event.source, event.sessionId), event);
    if (info.size <= state.offset) break;
  }
  return { status, chunks, bytes };
}
// Beam parses a finished transcript through the same capture core the hook uses, so the
// resulting state record leaves the hook able to continue the session from that offset.
export async function beam(
  input: string,
  config: Config,
  options: DrainOptions & CaptureOptions = {},
): Promise<BeamResult> {
  const event = await claudeCodeLocate(input);
  if (!event) throw new Error(`No Claude Code transcript found for ${input}`);
  const result = await captureAll(event, config, options);
  let chunks = result.chunks;
  let childrenCaptured = 0;
  if (wasSpooled(result.status))
    for (const child of await children(event)) {
      const childResult = await captureAll(child, config, options);
      chunks += childResult.chunks;
      if (childResult.chunks > 0) childrenCaptured++;
    }
  const uploaded = await sync(config, options);
  return {
    sessionId: event.sessionId,
    status: result.status,
    chunks,
    children: childrenCaptured,
    uploaded,
  };
}
