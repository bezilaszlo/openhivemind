import { Type, type Static, type TSchema } from "@sinclair/typebox";
export { Type, type Static, type TSchema } from "@sinclair/typebox";
export const PROTOCOL_VERSION = 1;
const string = (maxLength = 4096) => Type.String({ maxLength });
export const Id = Type.String({ minLength: 1, maxLength: 200, pattern: "^[a-zA-Z0-9_.:-]+$" });
export const Timestamp = Type.String({ format: "date-time" });
export const Source = Type.Union(
  (["claude-code", "codex", "opencode"] as const).map((value) => Type.Literal(value)),
);
export const Kind = Type.Union(
  (["prompt", "reply", "tool_call", "summary"] as const).map((value) => Type.Literal(value)),
);
export const Role = Type.Union([Type.Literal("admin"), Type.Literal("member")]);
export const Usage = Type.Object({
  input: Type.Integer({ minimum: 0 }),
  output: Type.Integer({ minimum: 0 }),
  cache_read: Type.Integer({ minimum: 0 }),
  cache_creation: Type.Integer({ minimum: 0 }),
});
export type Usage = Static<typeof Usage>;
export const Message = Type.Object({
  seq: Type.Integer({ minimum: 1 }),
  rev: Type.Integer({ minimum: 1 }),
  kind: Kind,
  text: string(65536),
  ts: Timestamp,
  source_event_id: Type.Optional(string()),
  tool_name: Type.Optional(string(200)),
  branch: Type.Optional(string()),
  model: Type.Optional(string(200)),
  usage: Type.Optional(Type.Union([Usage, Type.Null()])),
  truncated: Type.Optional(Type.Boolean()),
});
export type Message = Static<typeof Message>;
export const Meta = Type.Object({
  source: Source,
  version: string(100),
  remote: string(),
  cwd: string(),
  branch: string(),
  branches: Type.Array(string(), { maxItems: 1000 }),
  title: string(),
  started_at: Timestamp,
  completed: Type.Boolean(),
  parent_external_id: Type.Optional(Id),
  spawn_depth: Type.Integer({ minimum: 0, maximum: 100 }),
  model_explicit: Type.Optional(string(200)),
  models: Type.Array(string(200), { maxItems: 1000 }),
});
export type Meta = Static<typeof Meta>;
export const Chunk = Type.Object({
  protocolVersion: Type.Integer({ minimum: 1 }),
  chunkId: Id,
  meta: Meta,
  messages: Type.Array(Message, { maxItems: 500 }),
});
export type Chunk = Static<typeof Chunk>;
export const Problem = Type.Object({
  type: string(),
  title: string(),
  status: Type.Integer(),
  detail: string(),
  minimumVersion: Type.Optional(Type.Integer()),
});
export const AgentModelUse = Type.Object({
  model: string(200),
  count: Type.Integer({ minimum: 1 }),
  inherited: Type.Integer({ minimum: 0 }),
});
/** Rollup over a session's subagents. Null when the session spawned none. */
export const Agents = Type.Object({
  count: Type.Integer({ minimum: 1 }),
  maxDepth: Type.Integer({ minimum: 1 }),
  models: Type.Array(AgentModelUse, { maxItems: 1000 }),
  inputTokens: Type.Integer({ minimum: 0 }),
  outputTokens: Type.Integer({ minimum: 0 }),
});
export type Agents = Static<typeof Agents>;
export const Session = Type.Intersect([
  Meta,
  Type.Object({
    id: Id,
    external_id: Id,
    owner_user_id: Id,
    parent_session_id: Type.Union([Id, Type.Null()]),
    last_activity_at: Timestamp,
    received_at: Timestamp,
    tokens: Type.Union([Usage, Type.Null()]),
    messageCount: Type.Integer(),
    childCount: Type.Integer(),
    agents: Type.Union([Agents, Type.Null()]),
    lastPrompt: Type.Union([string(), Type.Null()]),
    lastReply: Type.Union([string(), Type.Null()]),
    summary: Type.Union([string(), Type.Null()]),
  }),
]);
export type Session = Static<typeof Session>;
const page = <T extends TSchema>(item: T) =>
  Type.Object({ items: Type.Array(item), cursor: Type.Union([string(), Type.Null()]) });
export const Filters = Type.Object({
  remote: Type.Optional(string()),
  author: Type.Optional(Id),
  branch: Type.Optional(string()),
  since: Type.Optional(Timestamp),
  until: Type.Optional(Timestamp),
  kind: Type.Optional(Kind),
  mine: Type.Optional(Type.Boolean()),
  cursor: Type.Optional(string()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});
export const SearchRequest = Type.Intersect([
  Filters,
  Type.Object({
    query: Type.String({ minLength: 1, maxLength: 4096 }),
    regex: Type.Optional(Type.Boolean()),
    caseSensitive: Type.Optional(Type.Boolean()),
    context: Type.Optional(Type.Integer({ minimum: 0, maximum: 10, default: 0 })),
  }),
]);
export const Member = Type.Object({ userId: Id, name: string(), email: string(), role: Role });
export const Token = Type.Object({
  id: Id,
  name: string(200),
  scopes: Type.Array(Type.Union([Type.Literal("read"), Type.Literal("ingest")])),
  created_at: Timestamp,
  last_used_at: Type.Union([Timestamp, Type.Null()]),
});
export const Invite = Type.Object({
  id: Id,
  email: Type.Union([string(), Type.Null()]),
  role: Role,
  expires_at: Timestamp,
});
export interface Route<
  P extends TSchema = TSchema,
  B extends TSchema = TSchema,
  R extends TSchema = TSchema,
  Q extends TSchema = TSchema,
> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  params: P;
  body: B;
  response: R;
  query: Q;
  status: number;
}
const empty = Type.Object({});
function route<P extends TSchema, B extends TSchema, R extends TSchema, Q extends TSchema>(
  method: Route["method"],
  path: string,
  params: P,
  body: B,
  response: R,
  query: Q,
  status = 200,
): Route<P, B, R, Q> {
  return { method, path, params, body, response, query, status };
}
const sessionId = Type.Object({ id: Id });
const ok = Type.Object({ ok: Type.Literal(true) });
export const routes = {
  config: route(
    "GET",
    "/api/v1/config",
    empty,
    empty,
    Type.Object({
      appUrl: string(),
      providers: Type.Array(string()),
      features: Type.Record(Type.String(), Type.Boolean()),
      protocol: Type.Object({ current: Type.Integer(), minimum: Type.Integer() }),
    }),
    empty,
  ),
  ingest: route(
    "POST",
    "/api/v1/ingest/sessions/:externalId",
    Type.Object({ externalId: Id }),
    Chunk,
    Type.Object({ chunkId: Id, committedThrough: Type.Integer() }),
    empty,
    202,
  ),
  sessions: route(
    "GET",
    "/api/v1/sessions",
    empty,
    empty,
    page(Session),
    Type.Intersect([
      Filters,
      Type.Object({
        parent: Type.Optional(Id),
        includeChildren: Type.Optional(Type.Boolean()),
        subagents: Type.Optional(Type.Boolean()),
        nested: Type.Optional(Type.Boolean()),
        inherited: Type.Optional(Type.Boolean()),
      }),
    ]),
  ),
  session: route(
    "GET",
    "/api/v1/sessions/:id",
    sessionId,
    empty,
    Type.Object({
      session: Session,
      messages: Type.Array(Message),
      cursor: Type.Union([string(), Type.Null()]),
    }),
    Type.Object({
      from: Type.Optional(Type.Integer({ minimum: 1 })),
      to: Type.Optional(Type.Integer({ minimum: 1 })),
      around: Type.Optional(Type.Integer({ minimum: 1 })),
      context: Type.Optional(Type.Integer({ minimum: 0, maximum: 100, default: 10 })),
      last: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
      kind: Type.Optional(Kind),
      maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 200000, default: 20000 })),
    }),
  ),
  search: route(
    "POST",
    "/api/v1/search",
    empty,
    SearchRequest,
    page(
      Type.Object({
        session: Session,
        score: Type.Number(),
        seq: Type.Integer(),
        kind: Kind,
        snippet: string(),
        context: Type.Array(Message),
      }),
    ),
    empty,
  ),
  purge: route(
    "DELETE",
    "/api/v1/sessions/:id",
    sessionId,
    empty,
    Type.Object({ deleted: Type.Integer() }),
    empty,
  ),
  changes: route(
    "GET",
    "/api/v1/changes",
    empty,
    empty,
    page(Type.Object({ id: Id, seq: Type.Integer(), deleted: Type.Boolean() })),
    Type.Object({
      since: Type.Optional(string()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    }),
  ),
  usage: route(
    "GET",
    "/api/v1/usage",
    empty,
    empty,
    Type.Object({
      totals: Type.Union([Usage, Type.Null()]),
      unknownMessages: Type.Integer(),
      groups: Type.Array(
        Type.Object({
          remote: string(),
          model: Type.Union([string(), Type.Null()]),
          tokens: Usage,
        }),
      ),
    }),
    Type.Object({
      since: Type.Optional(Timestamp),
      until: Type.Optional(Timestamp),
      remote: Type.Optional(string()),
    }),
  ),
  remotes: route(
    "GET",
    "/api/v1/remotes",
    empty,
    empty,
    page(Type.Object({ remote: string() })),
    Filters,
  ),
  org: route(
    "GET",
    "/api/v1/orgs/me",
    empty,
    empty,
    Type.Object({ id: Id, name: string(), userId: Id, role: Role }),
    empty,
  ),
  members: route("GET", "/api/v1/orgs/me/members", empty, empty, page(Member), Filters),
  memberRole: route(
    "PATCH",
    "/api/v1/orgs/me/members/:id",
    sessionId,
    Type.Object({ role: Role }),
    ok,
    empty,
  ),
  memberDelete: route("DELETE", "/api/v1/orgs/me/members/:id", sessionId, empty, ok, empty),
  invites: route("GET", "/api/v1/orgs/me/invites", empty, empty, page(Invite), Filters),
  inviteCreate: route(
    "POST",
    "/api/v1/orgs/me/invites",
    empty,
    Type.Object({ email: Type.Optional(string()), role: Role }),
    Type.Object({ invite: Invite, token: string() }),
    empty,
  ),
  inviteDelete: route("DELETE", "/api/v1/orgs/me/invites/:id", sessionId, empty, ok, empty),
  inviteAccept: route(
    "POST",
    "/api/v1/invites/accept",
    empty,
    Type.Object({ token: string() }),
    ok,
    empty,
  ),
  tokens: route("GET", "/api/v1/me/tokens", empty, empty, page(Token), Filters),
  tokenCreate: route(
    "POST",
    "/api/v1/me/tokens",
    empty,
    Type.Object({ name: Type.String({ minLength: 1, maxLength: 200 }) }),
    Type.Object({ token: string(), info: Token }),
    empty,
  ),
  tokenDelete: route("DELETE", "/api/v1/me/tokens/:id", sessionId, empty, ok, empty),
  providers: route(
    "GET",
    "/api/v1/auth/providers",
    empty,
    empty,
    Type.Object({ providers: Type.Array(string()) }),
    empty,
  ),
};

const AuthUser = Type.Object({ id: Id, name: Type.String(), email: Type.String() });
const AuthResult = Type.Object({ user: AuthUser, token: Type.Union([Type.String(), Type.Null()]) });
export const authRoutes = {
  login: route(
    "POST",
    "/api/auth/sign-in/email",
    empty,
    Type.Object({ email: Type.String(), password: Type.String() }),
    AuthResult,
    empty,
  ),
  register: route(
    "POST",
    "/api/auth/sign-up/email",
    empty,
    Type.Object({ name: Type.String(), email: Type.String(), password: Type.String() }),
    AuthResult,
    empty,
  ),
  logout: route(
    "POST",
    "/api/auth/sign-out",
    empty,
    empty,
    Type.Object({ success: Type.Boolean() }),
    empty,
  ),
  oidc: route(
    "POST",
    "/api/auth/sign-in/social",
    empty,
    Type.Object({ provider: Type.String(), callbackURL: Type.String() }),
    Type.Object({ url: Type.String(), redirect: Type.Boolean() }),
    empty,
  ),
};
