import { homedir } from "node:os";
import { join } from "node:path";
import type { Event } from "../capture";
const dataHome = () => process.env["XDG_DATA_HOME"] || join(homedir(), ".local/share");
export const opencodeDatabase = () => join(dataHome(), "opencode", "opencode.db");
// opencode labels a fresh session `New session - <ISO>` until the title agent renames it; that
// timestamp would otherwise outrank the developer's first prompt forever.
const PLACEHOLDER = /^New session\b/;
interface SessionRow {
  parent_id: string | null;
  directory: string;
  title: string;
  version: string;
}
// tsup rewrites ESM `node:sqlite` imports to a non-existent bare `sqlite` package. The bundle
// banner supplies this Node-native require and preserves the protocol-prefixed name.
function open(path: string) {
  const { DatabaseSync } = require(["node", "sqlite"].join(":")) as typeof import("node:sqlite");
  // A concurrent opencode write holds the database briefly; wait for it rather than failing.
  return new DatabaseSync(path, { readOnly: true, timeout: 2000 });
}
function query<T>(path: string, run: (database: ReturnType<typeof open>) => T): T {
  const database = open(path);
  try {
    return run(database);
  } finally {
    database.close();
  }
}
// The drain reads every session's title and children before it uploads anything, so a database
// that is gone or still locked must not take the drain — and with it every other harness's
// pending chunks — down with it.
function safely<T>(fallback: T, run: () => T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
const str = (value: unknown): string => (typeof value === "string" ? value : "");
function sessionRow(path: string, sessionId: string): SessionRow | undefined {
  return query(path, (database) =>
    database
      .prepare("SELECT parent_id, directory, title, version FROM session WHERE id = ?")
      .get(sessionId),
  ) as SessionRow | undefined;
}
export function opencodeTitle(path: string, sessionId: string): string | undefined {
  const title = safely(undefined, () => sessionRow(path, sessionId))?.title;
  return title && !PLACEHOLDER.test(title) ? title : undefined;
}
// `session.idle` fires for subagent sessions too, so a descendant can be captured either from
// its own idle or as a child of the root. Both paths have to name the same root and the same
// depth, or `parent_external_id` would flip between captures.
function root(path: string, row: SessionRow): { id: string; depth: number } | undefined {
  let id = row.parent_id;
  for (let depth = 1; id && depth <= 8; depth++) {
    const parent = sessionRow(path, id);
    if (!parent?.parent_id) return { id, depth };
    id = parent.parent_id;
  }
  return undefined;
}
// The plugin sends `{sessionId, dbPath, cwd, source}` on `session.idle`; the session row is
// authoritative for cwd, so a child session is captured against its own directory.
export function opencodeEvent(input: unknown): Event {
  const value = (input ?? {}) as Record<string, unknown>;
  const sessionId = str(value["sessionId"]);
  if (!sessionId) throw new Error("Hook input is missing sessionId");
  const transcriptPath = str(value["dbPath"]) || opencodeDatabase();
  const row = sessionRow(transcriptPath, sessionId);
  if (!row) throw new Error("No opencode session for this id");
  const title = PLACEHOLDER.test(row.title) ? "" : row.title;
  const parent = root(transcriptPath, row);
  return {
    sessionId,
    transcriptPath,
    cwd: row.directory || str(value["cwd"]),
    source: "opencode",
    ...(row.version ? { version: row.version } : {}),
    ...(title ? { title } : {}),
    ...(parent ? { parentId: parent.id, spawnDepth: parent.depth } : {}),
  };
}
// Nesting is flattened: every descendant hangs off the root session and carries its depth.
export function opencodeChildren(event: Event): Event[] {
  const children: Event[] = [];
  safely(undefined, () =>
    query(event.transcriptPath, (database) => {
      const statement = database.prepare(
        "SELECT id, directory, title, version FROM session WHERE parent_id = ?",
      );
      let frontier = [event.sessionId];
      for (let depth = 1; frontier.length && depth <= 8; depth++) {
        const next: string[] = [];
        for (const parent of frontier)
          for (const row of statement.all(parent) as unknown as Array<Record<string, unknown>>) {
            const id = str(row["id"]);
            const title = str(row["title"]);
            next.push(id);
            children.push({
              sessionId: id,
              transcriptPath: event.transcriptPath,
              cwd: str(row["directory"]) || event.cwd,
              source: "opencode",
              parentId: event.sessionId,
              spawnDepth: depth,
              ...(str(row["version"]) ? { version: str(row["version"]) } : {}),
              ...(title && !PLACEHOLDER.test(title) ? { title } : {}),
              ...(event.completed ? { completed: true } : {}),
            });
          }
        frontier = next;
      }
    }),
  );
  return children;
}
// opencode upserts rows in place, so the capture cursor is a timestamp, not a byte offset: every
// message whose own row or any of its parts changed after the cursor is re-read and re-emitted,
// and capture turns an unchanged content hash into a no-op and a changed one into `rev + 1`.
// A part can be updated after its message row was (streaming writes the text last), so the
// message's `time_updated` alone would strand the final text of every turn.
export function opencodeRecords(
  path: string,
  sessionId: string,
  cursor: number,
): { records: unknown[]; cursor: number } {
  return query(path, (database) => {
    const messages = database
      .prepare(
        `SELECT m.id AS id, m.time_created AS created, m.data AS data,
                max(m.time_updated,
                    coalesce((SELECT max(p.time_updated) FROM part p WHERE p.message_id = m.id), 0))
                  AS updated
         FROM message m WHERE m.session_id = ? ORDER BY m.time_created, m.id`,
      )
      .all(sessionId) as unknown as Array<Record<string, unknown>>;
    const parts = database.prepare("SELECT id, data FROM part WHERE message_id = ? ORDER BY id");
    let next = cursor;
    const records: unknown[] = [];
    for (const message of messages) {
      const updated = Number(message["updated"] ?? 0);
      if (updated > next) next = updated;
      if (updated <= cursor) continue;
      records.push({
        id: str(message["id"]),
        created_at: Number(message["created"] ?? 0),
        info: JSON.parse(str(message["data"]) || "{}") as unknown,
        parts: (parts.all(str(message["id"])) as unknown as Array<Record<string, unknown>>).map(
          (part) => ({
            ...(JSON.parse(str(part["data"]) || "{}") as object),
            id: str(part["id"]),
          }),
        ),
      });
    }
    return { records, cursor: next };
  });
}
