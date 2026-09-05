import type pg from "pg";
import {
  parseQuery,
  type Agents,
  type Query,
  type Session,
  type Message,
  type Usage,
  validate,
  routes,
} from "@openhivemind/shared";
import type { Context } from "./auth/bridge";
import { HttpError } from "./app";
import { transaction } from "./db/index";
export type Filter = {
  remote?: string;
  author?: string;
  branch?: string;
  since?: string;
  until?: string;
  mine?: boolean;
  kind?: string;
  limit?: number;
  cursor?: string;
  parent?: string;
  includeChildren?: boolean;
  subagents?: boolean;
  nested?: boolean;
  inherited?: boolean;
};
function cursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decode(value: string | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString());
    if (Array.isArray(parsed) && parsed.length <= 4) return parsed;
  } catch {}
  throw new HttpError(400, "Invalid cursor");
}
function filters(context: Context, filter: Filter, values: unknown[]) {
  const clauses = ["s.org_id=$1"];
  values.push(context.orgId);
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  if (filter.remote) add("s.remote=?", filter.remote);
  if (filter.author) add("s.owner_user_id=?", filter.author);
  if (filter.mine) add("s.owner_user_id=?", context.userId);
  if (filter.branch) add("s.meta->'branches' @> jsonb_build_array(?::text)", filter.branch);
  if (filter.since) add("s.last_activity_at>=?::timestamptz", filter.since);
  if (filter.until) add("s.last_activity_at<?::timestamptz", filter.until);
  if (filter.parent) add("s.parent_session_id=?", filter.parent);
  else if (!filter.includeChildren) clauses.push("s.parent_session_id IS NULL");
  // Subagent shape. Nesting is flattened: children hang off the root session and
  // meta.spawn_depth carries how deep the harness spawned them.
  const child = (extra = "") =>
    `EXISTS (SELECT 1 FROM agent_session c WHERE c.parent_session_id=s.id AND c.org_id=$1${extra})`;
  if (filter.subagents) clauses.push(child());
  if (filter.nested) clauses.push(child(" AND COALESCE((c.meta->>'spawn_depth')::int,1)>=2"));
  if (filter.inherited) clauses.push(child(" AND c.meta->>'model_explicit' IS NULL"));
  return clauses;
}
/**
 * One grouped pass over the children of every session on the page: how many,
 * how deep, which models and whether each child inherited the session's model.
 */
export async function agentRollups(
  db: pg.Pool | pg.PoolClient,
  orgId: string,
  ids: string[],
): Promise<Map<string, Agents>> {
  if (!ids.length) return new Map();
  const result = await db.query<{
    parent: string;
    count: number;
    max_depth: number;
    models: Agents["models"];
    input_tokens: string;
    output_tokens: string;
  }>(
    `WITH child AS (
   SELECT c.parent_session_id AS parent, c.id,
     GREATEST(COALESCE((c.meta->>'spawn_depth')::int,1),1) AS depth,
     (c.meta->>'model_explicit') IS NULL AS inherited,
     COALESCE(c.meta->'models'->>0,'Unknown') AS model
   FROM agent_session c WHERE c.org_id=$1 AND c.parent_session_id = ANY($2::text[])
 ), model AS (
   SELECT parent, model, count(*)::int AS count, count(*) FILTER (WHERE inherited)::int AS inherited
   FROM child GROUP BY parent, model
 ), consumed AS (
   SELECT c.parent, SUM((m.data->'usage'->>'input')::bigint) AS input,
     SUM((m.data->'usage'->>'output')::bigint) AS output
   FROM child c JOIN agent_message m ON m.session_id=c.id
   WHERE m.data->'usage' IS NOT NULL AND m.data->'usage'<>'null'::jsonb GROUP BY c.parent
 )
 SELECT c.parent, count(*)::int AS count, max(c.depth)::int AS max_depth,
   (SELECT jsonb_agg(jsonb_build_object('model',m.model,'count',m.count,'inherited',m.inherited)
      ORDER BY m.count DESC, m.model) FROM model m WHERE m.parent=c.parent) AS models,
   COALESCE((SELECT u.input FROM consumed u WHERE u.parent=c.parent),0)::bigint AS input_tokens,
   COALESCE((SELECT u.output FROM consumed u WHERE u.parent=c.parent),0)::bigint AS output_tokens
 FROM child c GROUP BY c.parent`,
    [orgId, ids],
  );
  return new Map(
    result.rows.map((row) => [
      row.parent,
      {
        count: row.count,
        maxDepth: row.max_depth,
        models: row.models ?? [],
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
      },
    ]),
  );
}
export async function sessionView(
  db: pg.Pool | pg.PoolClient,
  context: Context,
  id: string,
  rollups?: Map<string, Agents>,
): Promise<Session> {
  const result = await db.query(
    `SELECT s.*, (SELECT count(*)::int FROM agent_message WHERE session_id=s.id) AS count,
 (SELECT count(*)::int FROM agent_session WHERE parent_session_id=s.id AND org_id=$2) AS children,
 (SELECT text FROM agent_message WHERE session_id=s.id AND kind='prompt' ORDER BY seq DESC LIMIT 1) AS prompt,
 (SELECT text FROM agent_message WHERE session_id=s.id AND kind='reply' ORDER BY seq DESC LIMIT 1) AS reply,
 (SELECT text FROM agent_message WHERE session_id=s.id AND kind='summary' ORDER BY seq DESC LIMIT 1) AS summary,
 (SELECT jsonb_build_object('input',sum((data->'usage'->>'input')::bigint),'output',sum((data->'usage'->>'output')::bigint),'cache_read',sum((data->'usage'->>'cache_read')::bigint),'cache_creation',sum((data->'usage'->>'cache_creation')::bigint)) FROM agent_message WHERE session_id=s.id AND data->'usage' IS NOT NULL AND data->'usage'<>'null'::jsonb) AS tokens
 FROM agent_session s WHERE id=$1 AND org_id=$2`,
    [id, context.orgId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Session not found");
  const agents = (rollups ?? (await agentRollups(db, context.orgId, [id]))).get(id) ?? null;
  return {
    ...row.meta,
    id: row.id,
    external_id: row.external_id,
    owner_user_id: row.owner_user_id,
    parent_session_id: row.parent_session_id,
    last_activity_at: row.last_activity_at.toISOString(),
    received_at: row.received_at.toISOString(),
    completed: row.completed,
    messageCount: row.count,
    childCount: row.children,
    agents,
    lastPrompt: row.prompt?.slice(0, 500) ?? null,
    lastReply: row.reply?.slice(0, 500) ?? null,
    summary: row.summary?.slice(0, 4096) ?? null,
    tokens: row.tokens?.input === null ? null : row.tokens,
  };
}
export async function sessions(pool: pg.Pool, context: Context, filter: Filter) {
  const values: unknown[] = [];
  const where = filters(context, filter, values);
  const after = decode(filter.cursor);
  if (after.length) {
    if (typeof after[0] !== "string" || typeof after[1] !== "string")
      throw new HttpError(400, "Invalid cursor");
    values.push(after[0], after[1]);
    where.push(`(s.last_activity_at,s.id)<($${values.length - 1}::timestamptz,$${values.length})`);
  }
  const limit = Math.min(filter.limit ?? 20, 100);
  values.push(limit + 1);
  const result = await pool.query<{ id: string; last_activity_at: Date }>(
    `SELECT s.id,s.last_activity_at FROM agent_session s WHERE ${where.join(" AND ")} ORDER BY s.last_activity_at DESC,s.id DESC LIMIT $${values.length}`,
    values,
  );
  const selected = result.rows.slice(0, limit);
  const last = selected.at(-1);
  const rollups = await agentRollups(
    pool,
    context.orgId,
    selected.map((row) => row.id),
  );
  return {
    items: await Promise.all(selected.map((row) => sessionView(pool, context, row.id, rollups))),
    cursor:
      result.rows.length > limit && last
        ? cursor([last.last_activity_at.toISOString(), last.id])
        : null,
  };
}
export async function sessionDetail(
  pool: pg.Pool,
  context: Context,
  prefix: string,
  options: {
    from?: number;
    to?: number;
    around?: number;
    context?: number;
    last?: number;
    kind?: string;
    maxChars?: number;
  } = {},
) {
  const ids = await pool.query<{ id: string }>(
    "SELECT id FROM agent_session WHERE org_id=$1 AND starts_with(id,$2) ORDER BY id LIMIT 2",
    [context.orgId, prefix],
  );
  if (!ids.rows.length) throw new HttpError(404, "Session not found");
  if (ids.rows.length > 1) throw new HttpError(409, "Ambiguous session prefix");
  const id = ids.rows[0]!.id;
  const from = options.around
    ? Math.max(1, options.around - (options.context ?? 10))
    : (options.from ?? 1);
  const to = options.around ? options.around + (options.context ?? 10) : (options.to ?? 2147483647);
  const rows = await pool.query<{ data: Message }>(
    `SELECT data FROM agent_message WHERE session_id=$1 AND seq BETWEEN $2 AND $3 AND ($4::text IS NULL OR kind=$4) ORDER BY seq ${options.last ? "DESC" : "ASC"} LIMIT $5`,
    [id, from, to, options.kind ?? null, Math.min(options.last ?? 500, 500)],
  );
  let remaining = options.maxChars ?? 20000;
  const messages: Message[] = [];
  let more = false;
  for (const { data } of rows.rows) {
    if (remaining === 0) {
      more = true;
      break;
    }
    const text = data.text.slice(0, remaining);
    remaining -= text.length;
    messages.push({
      ...data,
      text,
      ...(text.length < data.text.length ? { truncated: true } : {}),
    });
  }
  if (options.last) messages.reverse();
  return {
    session: await sessionView(pool, context, id),
    messages,
    cursor: more || rows.rows.length === 500 ? cursor([messages.at(-1)?.seq ?? 0]) : null,
  };
}
function compile(query: Query, values: unknown[]): string {
  if ("value" in query) {
    values.push(query.value);
    return `${query.type === "phrase" ? "phraseto_tsquery" : "plainto_tsquery"}('simple',$${values.length})`;
  }
  if (query.type === "not") return `!!(${compile(query.child, values)})`;
  return `(${compile(query.left, values)}) ${query.type === "and" ? "&&" : "||"} (${compile(query.right, values)})`;
}
export async function search(
  pool: pg.Pool,
  context: Context,
  request: Filter & { query: string; regex?: boolean; caseSensitive?: boolean; context?: number },
) {
  return transaction(pool, async (db) => {
    await db.query("SET LOCAL statement_timeout='1500ms'");
    const values: unknown[] = [];
    const where = filters(context, { ...request, includeChildren: true }, values);
    let rank = "1::real";
    if (request.regex) {
      values.push(request.query);
      where.push(`m.text ${request.caseSensitive ? "~" : "~*"} $${values.length}`);
    } else {
      let ast: Query;
      try {
        ast = parseQuery(request.query);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Invalid query");
      }
      const tsquery = compile(ast, values);
      where.push(`m.search @@ (${tsquery})`);
      rank = `ts_rank_cd(m.search,(${tsquery}))`;
    }
    if (request.kind) {
      values.push(request.kind);
      where.push(`m.kind=$${values.length}`);
    }
    const after = decode(request.cursor);
    let pagination = "";
    if (after.length) {
      if (
        typeof after[0] !== "number" ||
        typeof after[1] !== "string" ||
        typeof after[2] !== "string"
      )
        throw new HttpError(400, "Invalid cursor");
      values.push(...after);
      pagination = `WHERE (score,ts,id)<($${values.length - 2}::real,$${values.length - 1}::timestamptz,$${values.length})`;
    }
    const limit = Math.min(request.limit ?? 20, 100);
    values.push(limit + 1);
    try {
      const hits = await db.query<{
        id: string;
        seq: number;
        kind: Message["kind"];
        text: string;
        score: number;
        ts: Date;
      }>(
        `WITH hits AS (SELECT DISTINCT ON(s.id) s.id,m.seq,m.kind,left(m.text,500) text,m.ts,${rank} score FROM agent_session s JOIN agent_message m ON m.session_id=s.id WHERE ${where.join(" AND ")} ORDER BY s.id,score DESC,m.ts DESC,m.seq DESC) SELECT * FROM hits ${pagination} ORDER BY score DESC,ts DESC,id DESC LIMIT $${values.length}`,
        values,
      );
      const selected = hits.rows.slice(0, limit);
      const items = [];
      for (const hit of selected) {
        const contextRows = request.context
          ? await db.query<{ data: Message }>(
              "SELECT data FROM agent_message WHERE session_id=$1 AND seq BETWEEN $2 AND $3 AND seq<>$4 ORDER BY seq",
              [hit.id, Math.max(1, hit.seq - request.context), hit.seq + request.context, hit.seq],
            )
          : { rows: [] };
        items.push({
          session: await sessionView(db, context, hit.id),
          seq: hit.seq,
          kind: hit.kind,
          score: hit.score,
          snippet: hit.text,
          context: contextRows.rows.map((row) => ({
            ...row.data,
            text: row.data.text.slice(0, 500),
          })),
        });
      }
      const last = selected.at(-1);
      return {
        items,
        cursor:
          hits.rows.length > limit && last
            ? cursor([last.score, last.ts.toISOString(), last.id])
            : null,
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "57014")
        throw new HttpError(408, "Search timed out; narrow project or time filters");
      if (code === "2201B") throw new HttpError(400, "Invalid PostgreSQL regex");
      throw error;
    }
  });
}
export async function usage(
  pool: pg.Pool,
  context: Context,
  filter: { since?: string; until?: string; remote?: string },
) {
  const result = await pool.query<{
    remote: string;
    model: string | null;
    tokens: Usage;
    unknown: number;
  }>(
    `SELECT s.remote,m.data->>'model' model,count(*) FILTER(WHERE m.data->'usage' IS NULL OR m.data->'usage'='null'::jsonb)::int unknown,jsonb_build_object('input',coalesce(sum((m.data->'usage'->>'input')::bigint),0),'output',coalesce(sum((m.data->'usage'->>'output')::bigint),0),'cache_read',coalesce(sum((m.data->'usage'->>'cache_read')::bigint),0),'cache_creation',coalesce(sum((m.data->'usage'->>'cache_creation')::bigint),0)) tokens FROM agent_message m JOIN agent_session s ON s.id=m.session_id WHERE s.org_id=$1 AND ($2::timestamptz IS NULL OR m.ts>=$2) AND ($3::timestamptz IS NULL OR m.ts<$3) AND ($4::text IS NULL OR s.remote=$4) GROUP BY s.remote,m.data->>'model'`,
    [context.orgId, filter.since ?? null, filter.until ?? null, filter.remote ?? null],
  );
  const totals: Usage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const row of result.rows)
    for (const key of ["input", "output", "cache_read", "cache_creation"] as const)
      totals[key] += row.tokens[key];
  return validate(routes.usage.response, {
    totals: result.rows.length ? totals : null,
    unknownMessages: result.rows.reduce((sum, row) => sum + row.unknown, 0),
    groups: result.rows.map(({ remote, model, tokens }) => ({ remote, model, tokens })),
  });
}
