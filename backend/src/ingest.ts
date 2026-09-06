import { randomUUID, createHash } from "node:crypto";
import type pg from "pg";
import type { Chunk, Message, Meta } from "@openhivemind/shared";
import { transaction } from "./db/index";
import type { Context } from "./auth/bridge";
import { HttpError } from "./app";
export function contentHash(message: Message): string {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify(canonical(message)))
    .digest("hex");
}
export async function orgWrite(db: pg.PoolClient, orgId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [orgId]);
}
export async function ingest(
  pool: pg.Pool,
  context: Context,
  externalId: string,
  chunk: Chunk,
  retentionDays = 90,
) {
  if (!context.scopes.includes("ingest")) throw new HttpError(403, "Ingest scope required");
  if (chunk.protocolVersion !== 1) throw new HttpError(426, "Unsupported protocol; use version 1");
  for (const message of chunk.messages)
    if (Buffer.byteLength(message.text, "utf8") > 65536)
      throw new HttpError(413, "Message exceeds 64 KiB");
  return transaction(pool, async (db) => {
    // Serialize writes per organisation so allocated change cursors also follow commit order.
    await orgWrite(db, context.orgId);
    const identity = [context.orgId, chunk.meta.source, externalId];
    if (
      (
        await db.query(
          "SELECT 1 FROM purge_tombstone WHERE org_id=$1 AND source=$2 AND external_id=$3",
          identity,
        )
      ).rowCount
    )
      throw new HttpError(410, "Session was purged");
    const latest = Math.max(
      Date.parse(chunk.meta.started_at),
      ...chunk.messages.map((message) => Date.parse(message.ts)),
    );
    if (latest < Date.now() - retentionDays * 86400000)
      throw new HttpError(410, "Session is outside retention");
    if (latest > Date.now() + 300000)
      throw new HttpError(400, "Activity timestamp is in the future");
    const current = await db.query<{ id: string; owner_user_id: string; meta: Meta }>(
      "SELECT id,owner_user_id,meta FROM agent_session WHERE org_id=$1 AND source=$2 AND external_id=$3",
      identity,
    );
    const existing = current.rows[0];
    if (existing && existing.owner_user_id !== context.userId)
      throw new HttpError(403, "Session belongs to another developer");
    const id = existing?.id ?? randomUUID();
    const meta: Meta = {
      ...chunk.meta,
      completed: Boolean(existing?.meta.completed || chunk.meta.completed),
      branches: [...new Set([...(existing?.meta.branches ?? []), ...chunk.meta.branches])],
      models: [...new Set([...(existing?.meta.models ?? []), ...chunk.meta.models])],
    };
    if (existing && existing.meta.remote !== meta.remote)
      throw new HttpError(409, "Session project cannot change");
    const titleChanged = existing?.meta.title !== meta.title;
    await db.query(
      `INSERT INTO agent_session(id,org_id,owner_user_id,source,external_id,parent_external_id,remote,branch,meta,started_at,last_activity_at,completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (org_id,source,external_id) DO UPDATE SET meta=$9,branch=$8,completed=agent_session.completed OR $12,last_activity_at=GREATEST(agent_session.last_activity_at,$11),received_at=now(),parent_external_id=COALESCE(agent_session.parent_external_id,$6)`,
      [
        id,
        context.orgId,
        context.userId,
        meta.source,
        externalId,
        meta.parent_external_id ?? null,
        meta.remote,
        meta.branch,
        meta,
        meta.started_at,
        new Date(latest),
        meta.completed,
      ],
    );
    let changed = !existing;
    for (const message of chunk.messages) {
      const hash = contentHash(message);
      const prior = (
        await db.query<{ rev: number; hash: string }>(
          "SELECT rev,hash FROM agent_message WHERE session_id=$1 AND seq=$2",
          [id, message.seq],
        )
      ).rows[0];
      if (prior) {
        if (prior.rev > message.rev) continue;
        if (prior.rev === message.rev) {
          if (prior.hash !== hash) throw new HttpError(409, "Same revision has different content");
          continue;
        }
      }
      await db.query(
        `INSERT INTO agent_message(session_id,seq,rev,kind,text,ts,hash,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(session_id,seq) DO UPDATE SET rev=$3,kind=$4,text=$5,ts=$6,hash=$7,data=$8,received_at=now()`,
        [id, message.seq, message.rev, message.kind, message.text, message.ts, hash, message],
      );
      changed = true;
    }
    // Resolve child-before-parent delivery only inside the same owner and organisation.
    await db.query(
      `UPDATE agent_session child SET parent_session_id=parent.id FROM agent_session parent WHERE child.org_id=$1 AND parent.org_id=child.org_id AND parent.owner_user_id=child.owner_user_id AND parent.source=child.source AND parent.external_id=child.parent_external_id AND child.parent_session_id IS NULL`,
      [context.orgId],
    );
    const cycle = await db.query(
      `WITH RECURSIVE chain AS (SELECT id,parent_session_id,ARRAY[id] path,false cycle FROM agent_session WHERE org_id=$1 UNION ALL SELECT parent.id,parent.parent_session_id,path||parent.id,parent.id=ANY(path) FROM chain JOIN agent_session parent ON parent.id=chain.parent_session_id WHERE NOT cycle) SELECT 1 FROM chain WHERE cycle LIMIT 1`,
      [context.orgId],
    );
    if (cycle.rowCount) throw new HttpError(409, "Session parent cycle");
    const rows = (
      await db.query<{ seq: number }>(
        "SELECT seq FROM agent_message WHERE session_id=$1 ORDER BY seq",
        [id],
      )
    ).rows;
    let committedThrough = 0;
    for (const row of rows) {
      if (row.seq !== committedThrough + 1) break;
      committedThrough = row.seq;
    }
    if (changed || titleChanged || existing?.meta.completed !== meta.completed)
      await db.query("INSERT INTO change(org_id,session_id,seq) VALUES($1,$2,$3)", [
        context.orgId,
        id,
        rows.at(-1)?.seq ?? 0,
      ]);
    return { chunkId: chunk.chunkId, committedThrough };
  });
}
export async function purge(pool: pg.Pool, context: Context, id: string) {
  return transaction(pool, async (db) => {
    await orgWrite(db, context.orgId);
    const row = (
      await db.query("SELECT owner_user_id FROM agent_session WHERE id=$1 AND org_id=$2", [
        id,
        context.orgId,
      ])
    ).rows[0];
    if (!row) throw new HttpError(404, "Session not found");
    if (row.owner_user_id !== context.userId)
      throw new HttpError(403, "Only the owner can purge this session");
    const descendants = await db.query<{ id: string }>(
      `WITH RECURSIVE tree AS (SELECT id FROM agent_session WHERE id=$1 AND org_id=$2 AND owner_user_id=$3 UNION SELECT s.id FROM agent_session s JOIN tree ON s.parent_session_id=tree.id WHERE s.org_id=$2 AND s.owner_user_id=$3) SELECT id FROM tree`,
      [id, context.orgId, context.userId],
    );
    const ids = descendants.rows.map((row) => row.id);
    await db.query(
      "INSERT INTO purge_tombstone(org_id,source,external_id) SELECT org_id,source,external_id FROM agent_session WHERE id=ANY($1::text[]) ON CONFLICT DO NOTHING",
      [ids],
    );
    await db.query(
      "INSERT INTO change(org_id,session_id,seq,deleted) SELECT org_id,id,0,true FROM agent_session WHERE id=ANY($1::text[])",
      [ids],
    );
    await db.query("DELETE FROM agent_session WHERE id=ANY($1::text[])", [ids]);
    return { deleted: ids.length };
  });
}
