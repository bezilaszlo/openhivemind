import { createApi, routes, type Message } from "@openhivemind/shared";
import type { Config } from "../config";
import { intFlag, type Options } from "../args";
import { readFormat, heading, bullet, truncate, describeRequestError } from "./format";
interface Result {
  lines: string[];
  exitCode: number;
}
const DEFAULT_LAST = 30;
const MATCH_SCAN_WINDOW = 500;
// The schema's maxChars ceiling; without it the server's 20000-char default cuts the
// 500-message scan window far short of 500 actual messages.
const MATCH_SCAN_MAX_CHARS = 200000;
function formatMessage(format: ReturnType<typeof readFormat>, message: Message): string {
  const time = message.ts.slice(11, 16);
  return bullet(
    format,
    `[${message.seq}] ${message.kind} ${time} ${truncate(message.text, 400)}${message.truncated ? " (server-truncated)" : ""}`,
  );
}
export async function show(config: Config, flags: Options): Promise<Result> {
  const id = flags.rest[0];
  if (!id)
    return {
      lines: [
        "Usage: openhivemind show <session-id> [--last N --match <text> --regex <pattern> --context N --format plain|md]",
      ],
      exitCode: 2,
    };
  const format = readFormat(flags.get("format"));
  const match = flags.get("match");
  const regexPattern = flags.get("regex");
  if (match !== undefined && regexPattern !== undefined)
    return { lines: ["--match and --regex are mutually exclusive"], exitCode: 2 };
  const context = intFlag(flags, "context", { min: 0 });
  if (context.error) return { lines: [context.error], exitCode: 2 };
  const radius = context.value ?? 5;
  const lastFlag = intFlag(flags, "last", { min: 1, max: 500 });
  if (lastFlag.error) return { lines: [lastFlag.error], exitCode: 2 };
  const last = lastFlag.value ?? DEFAULT_LAST;
  let matcher: ((text: string) => boolean) | undefined;
  if (match) matcher = (text) => text.includes(match);
  if (regexPattern) {
    let regex: RegExp;
    try {
      regex = new RegExp(regexPattern);
    } catch (error) {
      return {
        lines: [
          `Invalid --regex pattern: ${error instanceof Error ? error.message : "parse error"}`,
        ],
        exitCode: 2,
      };
    }
    matcher = (text) => regex.test(text);
  }
  const api = createApi(config.server, config.token);
  let response;
  try {
    response = await api(routes.session, {
      params: { id },
      query: matcher ? { last: MATCH_SCAN_WINDOW, maxChars: MATCH_SCAN_MAX_CHARS } : { last },
    });
  } catch (error) {
    return {
      lines: [describeRequestError(config.server, error, "Show request failed")],
      exitCode: 2,
    };
  }
  let messages = response.messages;
  if (matcher) {
    const index = messages.findIndex((message) => matcher!(message.text));
    if (index < 0)
      return {
        lines: [`No message matched in the ${messages.length} message(s) received.`],
        exitCode: 1,
      };
    messages = messages.slice(Math.max(0, index - radius), index + radius + 1);
  }
  const lines: string[] = [];
  lines.push(
    heading(
      format,
      `${truncate(response.session.title || "(untitled)", 100)} — ${response.session.id} [${response.session.source}]`,
    ),
  );
  for (const message of messages) lines.push(formatMessage(format, message));
  return { lines, exitCode: 0 };
}
