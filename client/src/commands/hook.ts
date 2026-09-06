import { spawn } from "node:child_process";
import { capture, wasSpooled, type Event } from "../capture";
import { loadConfig } from "../config";
import { errorClass, log } from "../state";
import { children, hookEvent } from "../harnesses/index";
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
    event = await hookEvent(JSON.parse(options.input ?? (await readStdin())) as unknown);
    if (!event) return;
    const config = await loadConfig();
    const results = [await capture(event, config, { dryRun: options.dryRun })];
    // Hand the spool over before capturing children: a harness that reaps the hook when the
    // session exits must not lose the uploader, which picks the children up on its own.
    const spooled = wasSpooled(results[0]!.status);
    if (spooled && !options.dryRun && !(await uploaderRunning(config)))
      await (options.startUploader ?? detach)();
    if (spooled)
      for (const child of await children(event))
        results.push(await capture(child, config, { dryRun: options.dryRun }));
    if (options.dryRun) {
      console.log(
        JSON.stringify(
          results.flatMap((result) => result.payloads ?? []),
          null,
          2,
        ),
      );
      return;
    }
    await log({
      source: event.source,
      session: event.sessionId,
      status: results[0]!.status,
      children: results.length - 1,
      chunks: results.reduce((total, result) => total + result.chunks, 0),
      bytes: results.reduce((total, result) => total + result.bytes, 0),
    });
  } catch (error) {
    await log({
      source: event?.source ?? "unknown",
      session: event?.sessionId ?? "unknown",
      status: "error",
      error: errorClass(error),
    }).catch(() => {});
  }
}
