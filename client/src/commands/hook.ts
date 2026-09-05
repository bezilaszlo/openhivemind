import { spawn } from "node:child_process";
import { capture, type Event } from "../capture";
import { loadConfig } from "../config";
import { errorClass, log } from "../state";
import { claudeCodeEvent } from "../harnesses/claude-code";
import { uploaderRunning } from "./sync";
export interface HookOptions {
  input?: string;
  dryRun?: boolean;
  startUploader?: () => void | Promise<void>;
}
async function readStdin(): Promise<string> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const part of process.stdin as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > 1024 * 1024) throw new Error("Hook input is too large");
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}
function detach() {
  const entry = process.argv[1];
  if (!entry) return;
  spawn(process.execPath, [entry, "sync"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref();
}
// The hook never reaches the network and never fails the harness: it spools and hands over.
export async function hook(options: HookOptions = {}): Promise<void> {
  let event: Event | undefined;
  try {
    event = claudeCodeEvent(JSON.parse(options.input ?? (await readStdin())) as unknown);
    if (!event) return;
    const config = await loadConfig();
    const result = await capture(event, config, { dryRun: options.dryRun });
    if (options.dryRun) {
      console.log(JSON.stringify(result.payloads ?? [], null, 2));
      return;
    }
    await log({
      source: event.source,
      session: event.sessionId,
      status: result.status,
      chunks: result.chunks,
      bytes: result.bytes,
    });
    // Nothing was spooled for this session only when the session never reaches the spool at all.
    const spooled = !["excluded", "no origin", "sensitive locator"].includes(result.status);
    if (spooled && !(await uploaderRunning(config))) await (options.startUploader ?? detach)();
  } catch (error) {
    await log({
      source: "claude-code",
      session: event?.sessionId ?? "unknown",
      status: "error",
      error: errorClass(error),
    }).catch(() => {});
  }
}
