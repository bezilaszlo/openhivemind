import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import type { FastifyRequest } from "fastify";
import { routes, type Chunk } from "@openhivemind/shared";
import { HttpError, type Handler } from "./app";
import { authenticate, hash, mintToken, headers, type Context } from "./auth/bridge";
import type { Auth } from "./auth/index";
import { ingest, purge, orgWrite } from "./ingest";
import { sessions, sessionDetail, search, usage, type Filter } from "./read";
import { transaction } from "./db/index";
export function handlers(
  pool: pg.Pool,
  auth: Auth,
  url: string,
  retentionDays = 90,
): Partial<Record<keyof typeof routes, Handler>> {
  const id = (request: FastifyRequest) => (request.params as { id: string }).id;
  const read =
    (fn: (request: FastifyRequest, context: Context) => Promise<unknown>): Handler =>
    async (request) => {
      const context = await authenticate(pool, auth, request, url);
      if (!context.scopes.includes("read")) throw new HttpError(403, "Read scope required");
      return fn(request, context);
    };
  const browser = (request: FastifyRequest) => {
    if (request.headers.authorization) throw new HttpError(403, "Browser session required");
  };
  const admin = (request: FastifyRequest, context: Context) => {
    browser(request);
    if (context.role !== "admin") throw new HttpError(403, "Administrator role required");
  };
  const page = (items: unknown[]) => ({ items, cursor: null });
  return {
    inviteAccept: async (request) => {
      browser(request);
      if (request.headers.origin !== url) throw new HttpError(403, "Untrusted origin");
      const session = await auth.api.getSession({ headers: headers(request) });
      if (!session) throw new HttpError(401, "Sign in required");
      return transaction(pool, async (db) => {
        const invitation = (
          await db.query(
            "SELECT * FROM invite WHERE token_sha256=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
            [hash((request.body as { token: string }).token)],
          )
        ).rows[0];
        if (
          !invitation ||
          (invitation.email && invitation.email.toLowerCase() !== session.user.email.toLowerCase())
        )
          throw new HttpError(403, "Invalid or expired invite");
        await orgWrite(db, invitation.org_id);
        const current = await db.query(
          "SELECT id FROM auth.member WHERE organization_id=$1 AND user_id=$2",
          [invitation.org_id, session.user.id],
        );
        if (current.rowCount) throw new HttpError(409, "Already a member");
        await db.query(
          "INSERT INTO auth.member(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,$4,now())",
          [randomUUID(), invitation.org_id, session.user.id, invitation.role],
        );
        await db.query("UPDATE invite SET accepted_at=now(),accepted_by=$1 WHERE id=$2", [
          session.user.id,
          invitation.id,
        ]);
        return { ok: true };
      });
    },
    providers: async () => ({
      providers: auth.options.plugins?.some((plugin) => plugin.id === "generic-oauth")
        ? ["local", "oidc"]
        : ["local"],
    }),
    ingest: async (request) => {
      if (!request.headers.authorization)
        throw new HttpError(401, "Personal access token required");
      return ingest(
        pool,
        await authenticate(pool, auth, request, url),
        (request.params as { externalId: string }).externalId,
        request.body as Chunk,
        retentionDays,
      );
    },
    sessions: read((request, context) => sessions(pool, context, request.query as Filter)),
    session: read((request, context) =>
      sessionDetail(
        pool,
        context,
        id(request),
        request.query as Parameters<typeof sessionDetail>[3],
      ),
    ),
    search: read((request, context) =>
      search(pool, context, request.body as Parameters<typeof search>[2]),
    ),
    usage: read((request, context) =>
      usage(pool, context, request.query as Parameters<typeof usage>[2]),
    ),
    purge: read((request, context) => purge(pool, context, id(request))),
    changes: read(async (request, context) => {
      const query = request.query as { since?: string; limit?: number };
      if (query.since && !/^\d{1,19}$/.test(query.since))
        throw new HttpError(400, "Invalid changes cursor");
      const result = await pool.query<{
        cursor: string;
        id: string;
        seq: number;
        deleted: boolean;
      }>(
        "SELECT cursor::text,session_id id,seq,deleted FROM change WHERE org_id=$1 AND cursor>$2::bigint ORDER BY cursor LIMIT $3",
        [context.orgId, query.since ?? "0", query.limit ?? 20],
      );
      return {
        items: result.rows.map(({ id, seq, deleted }) => ({ id, seq, deleted })),
        cursor: result.rows.at(-1)?.cursor ?? query.since ?? "0",
      };
    }),
    remotes: read(async (request, context) => {
      const query = request.query as Filter;
      const result = await pool.query(
        "SELECT DISTINCT remote FROM agent_session WHERE org_id=$1 AND remote>$2 ORDER BY remote LIMIT $3",
        [context.orgId, query.cursor ?? "", (query.limit ?? 20) + 1],
      );
      const items = result.rows.slice(0, query.limit ?? 20);
      return { items, cursor: result.rows.length > items.length ? items.at(-1)?.remote : null };
    }),
    org: read(async (_, context) => {
      const result = await pool.query("SELECT id,name FROM auth.organization WHERE id=$1", [
        context.orgId,
      ]);
      return { ...result.rows[0], userId: context.userId, role: context.role };
    }),
    members: read(async (request, context) => {
      const query = request.query as Filter;
      const result = await pool.query(
        'SELECT u.id AS "userId",u.name,u.email,m.role FROM auth.member m JOIN auth.user u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.id>$2 ORDER BY u.id LIMIT $3',
        [context.orgId, query.cursor ?? "", (query.limit ?? 20) + 1],
      );
      const items = result.rows.slice(0, query.limit ?? 20);
      return { items, cursor: result.rows.length > items.length ? items.at(-1)?.userId : null };
    }),
    memberRole: read(async (request, context) => {
      admin(request, context);
      return changeMember(
        pool,
        context,
        id(request),
        (request.body as { role: "admin" | "member" }).role,
      );
    }),
    memberDelete: read(async (request, context) => {
      admin(request, context);
      return changeMember(pool, context, id(request));
    }),
    invites: read(async (request, context) => {
      admin(request, context);
      return page(
        (
          await pool.query(
            "SELECT id,email,role,expires_at FROM invite WHERE org_id=$1 AND accepted_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 100",
            [context.orgId],
          )
        ).rows,
      );
    }),
    inviteCreate: read(async (request, context) => {
      admin(request, context);
      const body = request.body as { email?: string; role: "admin" | "member" };
      const token = randomBytes(32).toString("hex");
      const result = await pool.query(
        "INSERT INTO invite(id,org_id,email,role,token_sha256,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '7 days',$6) RETURNING id,email,role,expires_at",
        [randomUUID(), context.orgId, body.email ?? null, body.role, hash(token), context.userId],
      );
      return { invite: result.rows[0], token };
    }),
    inviteDelete: read(async (request, context) => {
      admin(request, context);
      await pool.query("DELETE FROM invite WHERE id=$1 AND org_id=$2", [
        id(request),
        context.orgId,
      ]);
      return { ok: true };
    }),
    tokens: read(async (request, context) => {
      browser(request);
      return page(
        (
          await pool.query(
            "SELECT id,name,scopes,created_at,last_used_at FROM api_token WHERE org_id=$1 AND user_id=$2 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 100",
            [context.orgId, context.userId],
          )
        ).rows,
      );
    }),
    tokenCreate: read(async (request, context) => {
      browser(request);
      return mintToken(pool, context, (request.body as { name: string }).name);
    }),
    tokenDelete: read(async (request, context) => {
      browser(request);
      await pool.query(
        "UPDATE api_token SET revoked_at=now() WHERE id=$1 AND org_id=$2 AND user_id=$3",
        [id(request), context.orgId, context.userId],
      );
      return { ok: true };
    }),
  };
}
async function changeMember(
  pool: pg.Pool,
  context: Context,
  userId: string,
  role?: "admin" | "member",
) {
  return transaction(pool, async (db) => {
    await orgWrite(db, context.orgId);
    const current = (
      await db.query(
        "SELECT role FROM auth.member WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
        [context.orgId, userId],
      )
    ).rows[0];
    if (!current) throw new HttpError(404, "Member not found");
    if (current.role === "admin" && role !== "admin") {
      const count = await db.query(
        "SELECT count(*)::int n FROM auth.member WHERE organization_id=$1 AND role='admin'",
        [context.orgId],
      );
      if (count.rows[0].n === 1)
        throw new HttpError(409, "The organisation must retain an administrator");
    }
    if (role)
      await db.query("UPDATE auth.member SET role=$1 WHERE organization_id=$2 AND user_id=$3", [
        role,
        context.orgId,
        userId,
      ]);
    else {
      await db.query("DELETE FROM auth.member WHERE organization_id=$1 AND user_id=$2", [
        context.orgId,
        userId,
      ]);
      await db.query("UPDATE api_token SET revoked_at=now() WHERE org_id=$1 AND user_id=$2", [
        context.orgId,
        userId,
      ]);
    }
    return { ok: true };
  });
}
