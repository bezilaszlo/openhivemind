import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import type { Auth } from "./index";
import { HttpError } from "../app";
import { transaction } from "../db/index";
export const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export interface Context {
  orgId: string;
  userId: string;
  role: "admin" | "member";
  scopes: string[];
}
export function headers(request: FastifyRequest): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
    else if (value) result.set(key, value);
  }
  return result;
}
export async function authenticate(
  pool: pg.Pool,
  auth: Auth,
  request: FastifyRequest,
  baseUrl: string,
): Promise<Context> {
  const bearer = request.headers.authorization;
  if (bearer) {
    if (!bearer.startsWith("Bearer ohm_")) throw new HttpError(401, "Invalid token");
    const result = await pool.query<Context>(
      `UPDATE api_token t SET last_used_at=now() FROM auth.member m WHERE t.token_sha256=$1 AND t.revoked_at IS NULL AND m.user_id=t.user_id AND m.organization_id=t.org_id RETURNING t.org_id AS "orgId",t.user_id AS "userId",m.role,t.scopes`,
      [hash(bearer.slice(7))],
    );
    if (!result.rows[0]) throw new HttpError(401, "Invalid token");
    return result.rows[0];
  }
  if (!["GET", "HEAD"].includes(request.method) && request.headers.origin !== baseUrl)
    throw new HttpError(403, "Untrusted origin");
  const session = await auth.api.getSession({ headers: headers(request) });
  if (!session) throw new HttpError(401, "Sign in required");
  const result = await pool.query<Context>(
    'SELECT organization_id AS "orgId",user_id AS "userId",role FROM auth.member WHERE user_id=$1',
    [session.user.id],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(403, "Organisation membership required");
  return { ...row, scopes: ["read", "ingest"] };
}
export async function mintToken(pool: pg.Pool, context: Context, name: string) {
  const token = "ohm_" + randomBytes(20).toString("hex");
  const id = randomUUID();
  const result = await pool.query(
    "INSERT INTO api_token(id,org_id,user_id,name,token_sha256,scopes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,scopes,created_at,last_used_at",
    [id, context.orgId, context.userId, name, hash(token), ["read", "ingest"]],
  );
  return { token, info: result.rows[0] };
}
export async function mountAuth(app: FastifyInstance, pool: pg.Pool, auth: Auth, url: string) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      const path = request.url.split("?")[0];
      // Our invite links and role checks own membership; native organization writes must not bypass them.
      if (path?.startsWith("/api/auth/organization/"))
        throw new HttpError(404, "Use the organisation API");
      const isRegister = path === "/api/auth/sign-up/email";
      const gate = isRegister ? await pool.connect() : undefined;
      try {
        if (gate) await gate.query("SELECT pg_advisory_lock(726142)");
        const body = request.body as Record<string, unknown> | undefined;
        let inviteId: string | undefined;
        let orgId: string | undefined;
        if (isRegister) {
          const existing = await pool.query("SELECT org_id FROM bootstrap WHERE id=1");
          orgId = existing.rows[0]?.org_id;
          if (orgId) {
            const token = request.headers["x-openhivemind-invite"];
            if (typeof token !== "string") throw new HttpError(403, "An invite is required");
            const invitation = await pool.query(
              "SELECT id FROM invite WHERE token_sha256=$1 AND accepted_at IS NULL AND expires_at>now() AND (email IS NULL OR lower(email)=lower($2))",
              [hash(token), body?.email],
            );
            inviteId = invitation.rows[0]?.id;
            if (!inviteId) throw new HttpError(403, "Invalid or expired invite");
          }
        }
        const response = await auth.handler(
          new Request(url + request.url, {
            method: request.method,
            headers: headers(request),
            ...(!["GET", "HEAD"].includes(request.method)
              ? { body: JSON.stringify(request.body ?? {}) }
              : {}),
          }),
        );
        if (isRegister && response.ok) {
          const data = (await response.clone().json()) as { user: { id: string } };
          await transaction(pool, async (db) => {
            if (!orgId) {
              orgId = randomUUID();
              await db.query(
                "INSERT INTO auth.organization(id,name,slug,created_at) VALUES($1,$2,$3,now())",
                [orgId, "Open Hivemind", "openhivemind"],
              );
              await db.query("INSERT INTO bootstrap(id,org_id) VALUES(1,$1)", [orgId]);
              await db.query(
                "INSERT INTO auth.member(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,$4,now())",
                [randomUUID(), orgId, data.user.id, "admin"],
              );
            } else {
              const result = await db.query(
                "UPDATE invite SET accepted_by=$1,accepted_at=now() WHERE id=$2 AND accepted_at IS NULL AND expires_at>now() RETURNING org_id,role",
                [data.user.id, inviteId],
              );
              if (!result.rows[0]) throw new HttpError(409, "Invite was already used");
              await db.query(
                "INSERT INTO auth.member(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,$4,now())",
                [randomUUID(), result.rows[0].org_id, data.user.id, result.rows[0].role],
              );
            }
          });
        }
        reply.code(response.status);
        response.headers.forEach((value, key) => {
          if (key !== "set-cookie") reply.header(key, value);
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header("set-cookie", cookies);
        return reply.send(await response.text());
      } finally {
        if (gate) {
          await gate.query("SELECT pg_advisory_unlock(726142)");
          gate.release();
        }
      }
    },
  });
}
