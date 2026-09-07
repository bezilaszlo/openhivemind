# Roadmap

Living document. Order matters more than dates. Decisions behind items live in
`docs/decisions/`.

## v1 — a team can run it

Goal: two developers on different laptops, same repo, see each other's sessions
in the viewer and via search within one turn of the hook firing.

- Harness targets: Claude Code, Codex CLI, opencode. One parser each behind a
  harness-neutral hook contract.
- Hook: incremental per-turn capture, local secret scrub, async, never blocks
  the harness. Subagent runs as child sessions. Compaction summaries kept and
  tagged.
- Historic beam of older sessions on demand, chunked.
- Server: idempotent ingest keyed by session id and sequence; full-text search
  (ranked terms, phrase, NOT, OR) and regex search over message text, filtered
  by project, author, branch, time, role; session list and detail with caps;
  token usage over a time window; retention sweep; personal access tokens.
- CLI and agent skills: search, sessions, fetch, show, tail, usage, share,
  purge, doctor, plus a `gist` skill that hands a session to a fresh chat with
  a short brief instead of compacting. Bounded output, TSV/JSON, grep exit
  codes.
- Web viewer: session list with filters and snippets, session as chat with
  collapsed tool calls, subagent tree, summary card, deep links, usage page,
  token management.
- Auth: local email/password with invites, OIDC login, PATs.
- Multi-tenant data model (organisations), single org in the boxed deploy.
- One-command deploy: compose with the app and Postgres.

## v1.x — more harnesses, better recall

- Bulk historic load: discover and beam every prior session on a machine, not just
  one at a time (`beam` today takes a single transcript or session id).
- Multi-hive routing: several named hives in one client config, each with its
  own server, token and roots. Roots route: the hook and the read commands pick
  the hive whose root contains the session's or shell's cwd, `--hive <name>`
  overrides, a cwd under no root is an error that names the hives, never a
  guess. Roots of different hives may not overlap, and a rootless hive is
  allowed only when it is the sole one, so a transcript can never reach the
  wrong server. Read output names the hive it answered from; `doctor` checks
  each. Also the supported answer for a single developer who wants
  multi-harness search without a shared server: a personal hive on localhost
  next to the team's.
- Additional harness parsers (Gemini CLI, Cursor, others by demand).
- Windows support for the client.
- Project-level visibility controls if teams ask for them.
- Search quality: technical-vocabulary tokenisation, identifier and path search,
  cross-session chronology.
- PR-review lens: tool-call-only views, branch filters, links from PRs to the
  sessions behind them.
- OpenTelemetry (traces across ingest and search, OTLP export) when a team
  wants more than the Prometheus `/metrics` endpoint.

## Later — understanding, not just recall

- Visual traces of agentic workflows: subagent trees, timelines, where a
  session went wrong.
- Server-side enrichment: labels, summaries, memories generated from sessions.
- Graph or vector retrieval over the corpus.
- Enterprise identity governance as a separate line (see decision 0001): SSO
  enforcement, SCIM, group mapping, SAML, audit log, session policies.

## Not planned

- Public hosted instance for open-source projects: trust in a shared database
  for transcripts is unlikely regardless of guardrails.
- Per-person analytics of any kind.
- A server-less local mode that searches this machine's transcripts. It only
  helps a single developer, who already has the harness's own history; the
  case that motivated it, an old session nobody beamed, is answered by bulk
  historic load above. Read commands need a configured hive and say so.
- Additional infrastructure beyond one relational database, unless real load
  proves the need.
