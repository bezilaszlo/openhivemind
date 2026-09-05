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

- Additional harness parsers (Gemini CLI, Cursor, others by demand).
- Windows support for the client.
- Project-level visibility controls if teams ask for them.
- Search quality: technical-vocabulary tokenisation, identifier and path search,
  cross-session chronology.
- PR-review lens: tool-call-only views, branch filters, links from PRs to the
  sessions behind them.

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
- Additional infrastructure beyond one relational database, unless real load
  proves the need.
