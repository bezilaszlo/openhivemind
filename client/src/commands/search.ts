import { createApi, routes, type Session, type Message } from "@openhivemind/shared";
import type { Config } from "../config";
import { filters, intFlag, type Options } from "../args";
import { readFormat, heading, bullet, truncate } from "./format";
interface Result {
  lines: string[];
  exitCode: number;
}
const SEARCH_LIMIT_CAP = 100;
const DEFAULT_LIMIT = 20;
// Bounded per-session snippet lines even without --context; --context widens the API window itself.
const MAX_SNIPPETS_PER_SESSION = 3;
export async function search(config: Config, flags: Options): Promise<Result> {
  const query = flags.rest.join(" ").trim();
  if (!query)
    return {
      lines: [
        "Usage: openhivemind search <query...> [--remote --author --branch --since --until --kind --mine --limit --context --regex --case-sensitive --format plain|md]",
      ],
      exitCode: 2,
    };
  const format = readFormat(flags.get("format"));
  const parsed = filters(flags);
  if (parsed.error) return { lines: [parsed.error], exitCode: 2 };
  const context = intFlag(flags, "context", { min: 0, max: 10 });
  if (context.error) return { lines: [context.error], exitCode: 2 };
  let response;
  try {
    response = await createApi(config.server, config.token)(routes.search, {
      body: {
        query,
        regex: flags.has("regex") || undefined,
        caseSensitive: flags.has("case-sensitive") || undefined,
        context: context.value,
        ...parsed.value,
      },
    });
  } catch (error) {
    return {
      lines: [error instanceof Error ? error.message : "Search request failed"],
      exitCode: 2,
    };
  }
  if (!response.items.length) return { lines: ["No results."], exitCode: 1 };
  const groups = new Map<
    string,
    {
      session: Session;
      hits: { snippet: string; kind: string; seq: number; context: Message[] }[];
    }
  >();
  for (const item of response.items) {
    const group = groups.get(item.session.id) ?? { session: item.session, hits: [] };
    group.hits.push(item);
    groups.set(item.session.id, group);
  }
  // Recipe promises sessions ranked by hit count, not by first-occurrence order.
  const ordered = [...groups.values()].sort((a, b) => b.hits.length - a.hits.length);
  const lines: string[] = [];
  lines.push(heading(format, `${response.items.length} hit(s) across ${groups.size} session(s)`));
  for (const group of ordered) {
    lines.push(
      heading(
        format,
        `${group.session.title || "(untitled)"} — ${group.session.id} [${group.session.source}] ${group.hits.length} hit(s)`,
      ),
    );
    for (const hit of group.hits.slice(0, MAX_SNIPPETS_PER_SESSION)) {
      lines.push(bullet(format, `seq ${hit.seq} (${hit.kind}): ${truncate(hit.snippet)}`));
      for (const message of hit.context)
        lines.push(
          bullet(
            format,
            `  ${message.seq === hit.seq ? "→" : " "} [${message.seq}] ${message.kind} ${truncate(message.text, 200)}`,
          ),
        );
    }
    if (group.hits.length > MAX_SNIPPETS_PER_SESSION)
      lines.push(
        bullet(
          format,
          `… ${group.hits.length - MAX_SNIPPETS_PER_SESSION} more hit(s) in this session`,
        ),
      );
  }
  if (response.cursor) {
    const effectiveLimit = parsed.value?.limit ?? DEFAULT_LIMIT;
    lines.push(
      heading(
        format,
        effectiveLimit >= SEARCH_LIMIT_CAP
          ? `Results truncated at the maximum limit (${SEARCH_LIMIT_CAP}); narrow filters to see fewer, more targeted results.`
          : "More results available; increase --limit.",
      ),
    );
  }
  return { lines, exitCode: 0 };
}
