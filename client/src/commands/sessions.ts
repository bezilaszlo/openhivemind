import { createApi, routes } from "@openhivemind/shared";
import type { Config } from "../config";
import { filters, type Options } from "../args";
import { readFormat, table, truncate, describeRequestError } from "./format";
interface Result {
  lines: string[];
  exitCode: number;
}
const SESSIONS_LIMIT_CAP = 100;
const DEFAULT_LIMIT = 20;
export async function sessions(config: Config, flags: Options): Promise<Result> {
  const format = readFormat(flags.get("format"));
  const rawSince = flags.get("since");
  const days = flags.get("days");
  if (days !== undefined && rawSince !== undefined)
    return { lines: ["--days and --since are mutually exclusive"], exitCode: 2 };
  let since = rawSince;
  if (days !== undefined) {
    const count = Number(days);
    if (!Number.isFinite(count) || count < 0)
      return { lines: ["--days must be a non-negative number"], exitCode: 2 };
    since = new Date(Date.now() - count * 24 * 60 * 60 * 1000).toISOString();
  }
  const parsed = filters(flags);
  if (parsed.error) return { lines: [parsed.error], exitCode: 2 };
  const query = { ...parsed.value, since };
  let response;
  try {
    response = await createApi(config.server, config.token)(routes.sessions, { query });
  } catch (error) {
    return {
      lines: [describeRequestError(config.server, error, "Sessions request failed")],
      exitCode: 2,
    };
  }
  if (!response.items.length) return { lines: ["No sessions."], exitCode: 1 };
  const header = ["id", "title", "harness", "author", "last activity", "messages"];
  const rows = response.items.map((session) => [
    session.id,
    truncate(session.title || "(untitled)", 60),
    session.source,
    session.owner_user_id,
    session.last_activity_at,
    String(session.messageCount),
  ]);
  const lines = table(format, header, rows);
  if (response.cursor) {
    const effectiveLimit = parsed.value?.limit ?? DEFAULT_LIMIT;
    lines.push(
      effectiveLimit >= SESSIONS_LIMIT_CAP
        ? `Results truncated at the maximum limit (${SESSIONS_LIMIT_CAP}); narrow filters to see fewer, more targeted results.`
        : "More sessions available; increase --limit.",
    );
  }
  return { lines, exitCode: 0 };
}
