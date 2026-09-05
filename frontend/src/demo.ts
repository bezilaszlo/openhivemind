import { type Session, type Message } from "@openhivemind/shared";
const now = Date.now();
const scenarios = [
  [
    "Fix duplicate webhook deliveries after worker restart",
    "openhivemind",
    "fix/webhook-replay",
    "claude-code",
    "The webhook worker occasionally sends the same event twice after a deploy. Can you trace the retry path?",
  ],
  [
    "Move session search to PostgreSQL full-text indexes",
    "openhivemind",
    "feat/session-search",
    "codex",
    "Search is getting slow as our history grows. Let’s look at the query plan before adding anything else.",
  ],
  [
    "A quieter, more readable session timeline",
    "openhivemind",
    "feat/session-reader",
    "claude-code",
    "Make the reader feel like a conversation. Tool calls should stay out of the way until I need them.",
  ],
  [
    "Investigate a connection pool spike during onboarding",
    "platform",
    "investigate/pool-saturation",
    "opencode",
    "We saw a latency spike when three developers synced their history at once. What was the bottleneck?",
  ],
  [
    "Add owner-only deletion with replay protection",
    "openhivemind",
    "feat/session-purge",
    "codex",
    "Deleting a session must also delete its agents, and a delayed upload must never bring it back.",
  ],
  [
    "Trace the missing token usage in resumed sessions",
    "openhivemind",
    "fix/late-usage",
    "claude-code",
    "The usage totals are lower after a resumed Codex session. Compare the raw response records with what we store.",
  ],
  [
    "Simplify invite acceptance and first-user bootstrap",
    "platform",
    "refactor/team-invites",
    "opencode",
    "Can we keep one clear membership path for both local accounts and SSO?",
  ],
  [
    "Keep secrets out of tool-call previews",
    "openhivemind",
    "fix/privacy-scrub",
    "claude-code",
    "Please audit the order of scrubbing and truncation. A secret might be beyond the preview boundary.",
  ],
] as const;
const replies = [
  "I found the duplicate at the boundary between **committing the event** and **acknowledging the queue message**.\n\nThe worker commits successfully, then a restart prevents the acknowledgement from reaching the queue. On redelivery, we treat the event as new.\n\n### The change\n\nUse the provider event ID as the idempotency key and claim it in the same transaction as the delivery record. A retry then becomes a no-op.\n\n```sql\nINSERT INTO webhook_delivery (event_id, payload)\nVALUES ($1, $2)\nON CONFLICT (event_id) DO NOTHING;\n```\n\nThis preserves the queue’s at-least-once contract without sending the webhook twice.",
  "The query plan confirms a sequential scan over message text. Most of the time is spent filtering rows we will never return.\n\nI added a generated `tsvector` column using the **simple** configuration, then a GIN index. This preserves technical vocabulary without introducing stemming surprises.\n\n```sql\nCREATE INDEX message_search\nON agent_message USING gin(search);\n```\n\nThe result set is still grouped by session and ranked by its best matching message. The tie-break is deterministic, so pagination stays predictable.",
  "The feed now gives the conversation a clear rhythm: prompts have a subtle surface, assistant text stays quiet, and tool calls collapse to a single line.\n\n### Reading behavior\n\n- Links open a bounded window around the selected message.\n- Older summaries remain in the conversation.\n- The current summary sits above the feed.\n- Incoming messages never move your reading position.\n\nI also removed the extra cards around individual messages. Separators are enough here.",
];
export const demoSessions: Session[] = scenarios.map(
  ([title, project, branch, source, prompt], index) => ({
    id: `demo-session-${index + 1}`,
    external_id: `fixture-${index + 1}`,
    owner_user_id: index % 3 === 0 ? "demo-user" : "teammate",
    source,
    version: "demo",
    remote: `github.com/hivemind/${project}`,
    cwd: `/projects/${project}`,
    branch,
    branches: [branch],
    title,
    started_at: new Date(now - (index + 1) * 3700000).toISOString(),
    last_activity_at: new Date(now - index * 2700000 - 300000).toISOString(),
    received_at: new Date(now - index * 2700000).toISOString(),
    completed: index > 1,
    spawn_depth: 0,
    models: [
      source === "codex" ? "gpt-5.4" : source === "opencode" ? "glm-4.7" : "claude-sonnet-4-6",
    ],
    parent_session_id: null,
    tokens: {
      input: 12400 + index * 3811,
      output: 2450 + index * 430,
      cache_read: 32000 + index * 6780,
      cache_creation: 4300,
    },
    messageCount: 7,
    childCount: 0,
    agents: null,
    lastPrompt: prompt,
    lastReply: "Implemented and verified. The regression test covers the original failure.",
    summary:
      index === 0
        ? "The duplicate-delivery bug was an acknowledgement race after a committed transaction. Provider event IDs now make retries idempotent. The regression covers a worker restart between commit and acknowledgement."
        : null,
  }),
);
const child = (
  parent: Session,
  index: number,
  title: string,
  spawn_depth: number,
  model?: string,
): Session => ({
  ...parent,
  id: `demo-agent-${index}`,
  external_id: `fixture-agent-${index}`,
  title,
  spawn_depth,
  parent_session_id: parent.id,
  parent_external_id: parent.external_id,
  model_explicit: model,
  models: [model ?? parent.models[0]!],
  messageCount: 5,
  childCount: 0,
  agents: null,
  summary: null,
  lastPrompt: title,
  lastReply: "Reported back to the parent session.",
  tokens: {
    input: 8200 + index * 900,
    output: 1400 + index * 130,
    cache_read: 9000,
    cache_creation: 0,
  },
});
const nested = demoSessions[0]!;
const flat = demoSessions[2]!;
demoSessions.push(
  child(nested, 1, "Search the worker for the acknowledgement path", 1),
  child(nested, 2, "Review the idempotency key migration", 1),
  child(nested, 3, "Check the queue acknowledgement contract", 1, "claude-haiku-4-6"),
  child(nested, 4, "Read the retry policy the reviewer flagged", 2),
  child(flat, 5, "Draft the reader typography scale", 1),
  child(flat, 6, "Collect the transcript fixtures", 1),
);
/** Mirrors the backend rollup: how many children, how deep, which models, what they cost. */
const rollup = (parent: Session): Session["agents"] => {
  const children = demoSessions.filter((session) => session.parent_session_id === parent.id);
  if (!children.length) return null;
  const models = new Map<string, { model: string; count: number; inherited: number }>();
  for (const session of children) {
    const model = session.models[0] ?? "Unknown";
    const use = models.get(model) ?? { model, count: 0, inherited: 0 };
    use.count += 1;
    if (!session.model_explicit) use.inherited += 1;
    models.set(model, use);
  }
  return {
    count: children.length,
    maxDepth: Math.max(...children.map((session) => session.spawn_depth || 1)),
    models: [...models.values()].sort(
      (left, right) => right.count - left.count || left.model.localeCompare(right.model),
    ),
    inputTokens: children.reduce((total, session) => total + (session.tokens?.input ?? 0), 0),
    outputTokens: children.reduce((total, session) => total + (session.tokens?.output ?? 0), 0),
  };
};
for (const session of demoSessions) {
  session.agents = rollup(session);
  session.childCount = session.agents?.count ?? 0;
}
export const demoMessages = (session: Session): Message[] => [
  { seq: 1, rev: 1, kind: "prompt", text: session.lastPrompt!, ts: session.started_at },
  {
    seq: 2,
    rev: 1,
    kind: "reply",
    text: "I’ll trace the current behavior first, then make the smallest change that fixes the failure. I’m starting with the implementation and the existing regression tests.",
    ts: session.started_at,
    model: session.models[0],
  },
  {
    seq: 3,
    rev: 1,
    kind: "tool_call",
    tool_name: "Read",
    text: "Read backend/src/worker.ts — delivery transaction and acknowledgement path",
    ts: session.started_at,
  },
  {
    seq: 4,
    rev: 1,
    kind: "reply",
    text: replies[(Number(session.id.split("-").at(-1)) - 1) % 3]!,
    ts: session.started_at,
    model: session.models[0],
  },
  {
    seq: 5,
    rev: 1,
    kind: "prompt",
    text: "That makes sense. Please add a regression for the failure, including the restart case. Keep the implementation together unless there is a clear reason to split it.",
    ts: session.last_activity_at,
  },
  {
    seq: 6,
    rev: 1,
    kind: "tool_call",
    tool_name: "Bash",
    text: "pnpm test:integration -- --run worker-replay.test.ts",
    ts: session.last_activity_at,
  },
  {
    seq: 7,
    rev: 1,
    kind: "reply",
    text: "Implemented and verified.\n\nThe regression reproduces the original failure and passes with the fix. It exercises the real database boundary, including a retry after the first transaction commits.\n\n**Validation:** unit checks, type checking, and the Postgres integration suite pass. No new runtime dependency was needed.\n\nThe remaining operational check is a restart during an onboarding burst; that belongs in the deployment acceptance run.",
    ts: session.last_activity_at,
    model: session.models[0],
  },
];
let tokens = [
  {
    id: "demo-token",
    name: "Work laptop",
    scopes: ["read", "ingest"],
    created_at: new Date(now - 86400000 * 4).toISOString(),
    last_used_at: new Date(now - 300000).toISOString(),
  },
];
let members = [
  { userId: "demo-user", name: "Alex Morgan", email: "alex@example.test", role: "admin" },
  { userId: "teammate", name: "Jamie Chen", email: "jamie@example.test", role: "member" },
  { userId: "teammate-2", name: "Sam Rivera", email: "sam@example.test", role: "member" },
];
export const demoTransport: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const path = url.pathname;
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  let value: unknown;
  if (path.endsWith("/orgs/me"))
    value = { id: "demo-org", name: "Hivemind team", userId: "demo-user", role: "admin" };
  else if (path.endsWith("/config"))
    value = {
      appUrl: url.origin,
      providers: ["local"],
      features: { capture: true },
      protocol: { current: 1, minimum: 1 },
    };
  else if (path.endsWith("/providers")) value = { providers: ["local"] };
  else if (path.endsWith("/sessions")) {
    let items = demoSessions.filter(
      (session) =>
        (!url.searchParams.get("remote") ||
          session.remote.includes(url.searchParams.get("remote")!)) &&
        (!url.searchParams.get("branch") ||
          session.branch.includes(url.searchParams.get("branch")!)) &&
        (url.searchParams.get("mine") !== "true" || session.owner_user_id === "demo-user") &&
        (url.searchParams.get("subagents") !== "true" || Boolean(session.agents)) &&
        (url.searchParams.get("nested") !== "true" || (session.agents?.maxDepth ?? 0) >= 2) &&
        (url.searchParams.get("inherited") !== "true" ||
          (session.agents?.models ?? []).some((use) => use.inherited > 0)),
    );
    const parent = url.searchParams.get("parent");
    items = parent
      ? demoSessions.filter((session) => session.parent_session_id === parent)
      : items.filter((session) => session.parent_session_id === null);
    value = { items, cursor: null };
  } else if (path.includes("/sessions/")) {
    const id = decodeURIComponent(path.split("/").at(-1)!);
    const session = demoSessions.find((session) => session.id === id);
    if (!session)
      return new Response(JSON.stringify({ detail: "Session not found" }), { status: 404 });
    if (init?.method === "DELETE") {
      demoSessions.splice(demoSessions.indexOf(session), 1);
      value = { deleted: 1 };
    } else {
      const kind = url.searchParams.get("kind");
      value = {
        session,
        messages: demoMessages(session).filter((message) => !kind || message.kind === kind),
        cursor: null,
      };
    }
  } else if (path.endsWith("/search")) {
    let items = demoSessions.filter((session) =>
      (
        session.title +
        " " +
        session.lastPrompt +
        " " +
        demoMessages(session)
          .map((message) => message.text)
          .join(" ")
      )
        .toLowerCase()
        .includes(String(body.query).toLowerCase()),
    );
    if (body.regex) {
      try {
        const regex = new RegExp(body.query, body.caseSensitive ? "" : "i");
        items = demoSessions.filter((session) =>
          regex.test(session.title + " " + session.lastPrompt),
        );
      } catch {
        return new Response(JSON.stringify({ detail: "Invalid regex pattern" }), { status: 400 });
      }
      if (!/[a-zA-Z0-9]{3}/.test(String(body.query)))
        return new Response(
          JSON.stringify({ detail: "Search timed out; narrow project or time filters" }),
          { status: 408 },
        );
    }
    value = {
      items: items.map((session) => ({
        session,
        score: 1,
        seq: 4,
        kind: "reply",
        snippet: demoMessages(session)[3]!.text.slice(0, 400),
        context: [],
      })),
      cursor: null,
    };
  } else if (path.endsWith("/changes")) value = { items: [], cursor: "demo-changes" };
  else if (path.endsWith("/usage")) {
    const totals = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    for (const session of demoSessions)
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += session.tokens?.[key] ?? 0;
    value = {
      totals,
      unknownMessages: 0,
      groups: demoSessions.map((session) => ({
        remote: session.remote,
        model: session.models[0],
        tokens: session.tokens,
      })),
    };
  } else if (path.endsWith("/me/tokens")) {
    if (init?.method === "POST") {
      const token = {
        id: "demo-token-" + Date.now(),
        name: body.name,
        scopes: ["read", "ingest"],
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      };
      tokens.push(token);
      value = { token: "DEMO-ONLY-NOT-A-REAL-TOKEN", info: token };
    } else value = { items: tokens, cursor: null };
  } else if (path.includes("/me/tokens/")) {
    tokens = tokens.filter((token) => token.id !== path.split("/").at(-1));
    value = { ok: true };
  } else if (path.endsWith("/members")) value = { items: members, cursor: null };
  else if (path.includes("/members/")) {
    members = members.map((member) =>
      member.userId === path.split("/").at(-1) ? { ...member, role: body.role } : member,
    );
    value = { ok: true };
  } else if (path.endsWith("/invites"))
    value = {
      invite: {
        id: "demo-invite",
        email: body.email ?? null,
        role: body.role,
        expires_at: new Date(now + 7 * 86400000).toISOString(),
      },
      token: "DEMO-INVITE-ONLY",
    };
  else if (path.endsWith("/sign-out")) value = { success: true };
  else if (path.includes("/sign-in/") || path.includes("/sign-up/"))
    value = {
      user: { id: "demo-user", name: "Alex Morgan", email: "alex@example.test" },
      token: null,
    };
  else
    return new Response(JSON.stringify({ detail: "Not available in the demo" }), { status: 404 });
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
};
