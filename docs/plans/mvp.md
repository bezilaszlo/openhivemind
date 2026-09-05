# MVP implementation plan

Target: ROADMAP v1. Stack per ADR 0002; identity line per ADR 0001.

Work is organised as gates. A gate opens when its exit criteria hold. How the
work inside a gate is split up or sequenced is not prescribed here.

## Definition of done

- Two developers, different laptops and folder layouts, same repo: each sees
  the other's sessions in the viewer and via `openhivemind search` within one
  turn while online. Offline: the tail is delivered by the drain path on the
  next hook, `sync`, or `doctor`, without a further turn being required.
- All three declared harnesses (Claude Code, Codex CLI, opencode) captured from
  real fixtures. If one cannot be delivered, the milestone is renamed, not
  quietly shipped as v1.
- No raw secret in payload, spool, log or fixture; scrub regression green.
- Tenant isolation, owner-only purge, retention and purge-retry tests green.
- Developer control: a session in a checkout outside `roots` or under
  `exclude` never leaves the machine (tested); a developer can delete any own
  session from the CLI and the viewer.
- Boolean and regex search behave per `docs/search.md`; usage matches exact
  fixtures.
- Clean-machine install of the packed client; bounded CLI output; exit codes
  0 / 1 (empty) / 2 (usage) as documented.
- One `docker compose up` from the repo root brings up app + Postgres.
- Load test per ADR 0002 recorded: corpus, concurrency, peak RSS, p95.

## Gate 1 — foundation and discovery

Exit: workspace and gates run green in CI; harness matrix and fixtures
committed; auth library decided; normalisation and privacy rules written;
`docs/search.md` written; the domain model below reconciled with the Drizzle
schema Better Auth actually generates (our tables alongside, names fixed).

- pnpm workspace: `backend/`, `frontend/`, `client/`, `packages/shared/`,
  `fixtures/`. Root `compose.yml` (DoD is `docker compose up` at the root) with
  a persistent DB volume; `deploy/` holds the Dockerfile and extra overlays.
- Node LTS pinned in `.nvmrc` and `engines`; `packageManager` pins pnpm. Client
  `engines` matches that LTS.
- Strict `tsconfig.base.json` (`noUncheckedIndexedAccess`), oxlint + oxfmt,
  Vitest workspace, lefthook running `pnpm check` on staged packages.
- Root `AGENTS.md`: map, commands, validation rules, code rules (lean, no shims,
  behaviour-first tests, targeted suppressions only). No `CLAUDE.md`.
- Root `LICENSE` (MIT), package metadata, attribution for gitleaks-derived
  scrub rules.
- CI: `check`; `integration` with a Postgres service; `pack` that builds the
  client tarball, installs it into a clean temp directory and runs the binary
  and lists the bundled skills. Never `npx` against the registry in CI.
- **Harness capability matrix** (`docs/protocol.md`): for Claude Code, Codex
  CLI and opencode, verified against an installed version and recorded with
  that version: transcript location and format, events and their sync/async
  and timeout semantics, end-of-session delivery, incremental read strategy,
  child/subagent linkage, usage availability, compaction representation, plugin
  packaging. One real session per harness captured, scrubbed by hand, committed
  under `fixtures/<harness>/` with golden normalised output.
- **Auth spike**: evaluate Better Auth for generic OIDC, invites, organisations
  and roles, schema ownership and migration integration under Drizzle. Decide
  Better Auth vs hand-rolled local auth + `openid-client`. Record in ADR 0003.
- **Project key**: normalisation rules for `origin` (SSH/HTTPS equivalence,
  host and path case, `.git`, embedded credentials, worktrees, nested repos),
  bounded git calls against the event cwd, no-origin policy (silent skip,
  reported by `doctor`). Written in `docs/protocol.md`, tested in `shared`.
- **Privacy rules** (`docs/privacy.md`): what is sent, scrub runs on full
  content before any truncation, metadata scrubbed too (remote credentials,
  cwd, title, branch, tool paths and arguments), hook log never
  contains transcript text or credentials, spool files mode 600,
  `.openhivemind-ignore` syntax with bad patterns failing closed for upload.
  Purge is owner-only, per VISION; there is no admin exception.

## Gate 2 — contract slice

Exit: every schema below exists as TypeBox in `packages/shared`, the server
generates `openapi.json` from them without a database, the web client is
generated from that file, and the contract tests pass against stub handlers.

Shared schemas are the source the server's route definitions import; they are
never a second, hand-maintained contract.

### Domain model

- `org(id, name, created_at)`
- `user(id, email unique, name, password_hash?, created_at)`; global users.
- `membership(org_id, user_id, role: admin|member, created_at)`; PK (org,
  user). First user to register creates an org and its admin membership in one
  transaction. Later users join only through an invite.
- `identity(user_id, issuer, subject)`, unique (issuer, subject). OIDC login
  with an unknown identity creates a user but no membership; an invite grants
  it. No account linking by unverified email.
- `invite(id, org_id, email?, role, token_sha256 unique, expires_at,
  accepted_by?, accepted_at?)`; single use; delivered as a copyable link,
  optional SMTP sends it.
- `web_session(id, user_id, expires_at)`; cookie, HttpOnly, CSRF token.
- `api_token(id, org_id, user_id, name, token_sha256 unique, scopes[],
  created_at, last_used_at, revoked_at)`; `ohm_` + 40 hex, hashed at rest,
  scopes `ingest`, `read` (MVP mints both).
- `agent_session(id internal, org_id, owner_user_id, source, external_id,
  parent_session_id? → agent_session.id, remote, branch, branches jsonb, cwd,
  title, spawn_depth, model_explicit, models jsonb, started_at, last_activity_at,
  received_at, completed, tokens{input, output, cache_read, cache_creation})`;
  unique (org_id, source, external_id). Owner is always the PAT's user; ingest
  into an existing session from a different user's PAT is rejected with 403
  and reported by `doctor` (the client never retries it). Parent
  resolved deferred: a child arriving first stores `parent_external_id` and is
  linked when the parent arrives; parent must have the same org **and the
  same owner**, otherwise the child stays unlinked and `doctor` reports it;
  cycles rejected. Descendant deletion therefore stays owner-only.
- `agent_message(session_id, seq, kind: prompt|reply|tool_call|summary,
  source_event_id?, tool_name?, text, ts, branch?, model?, rev, usage?{input,
  output, cache_read, cache_creation})`; PK (session, seq); FTS column over
  `text` for all kinds; trigram index on `text`. Usage recorded once per
  provider response, as deltas, `null` = unknown. Multiple summaries are kept
  as messages; the session's "current summary" is the latest by seq.
- `purge_tombstone(org_id, source, external_id, purged_at)`; ingest after a
  tombstone returns 410 and the client drops its spool for that session.

### Ingest contract

- `POST /api/v1/ingest/sessions/{externalId}` with `{chunkId, meta, messages[]}`.
- Chunk limits: 2 MiB body after decompression, 64 KiB per message text
  (client splits oversize text into continuation messages marked
  `truncated: true`, never drops), 500 messages per chunk. Server rejects with
  413 and a reason; client never re-sends an unfixable chunk forever: after N
  permanent rejections it marks the chunk dead and `doctor` reports it.
- Revisions: each message carries `rev` (from 1). Same seq, same rev, same
  content hash: no-op. Same seq, higher rev: the row is replaced (text, usage,
  FTS, `received_at`); this is how opencode's upserts arrive. Same seq, same
  rev, different hash: 409 and reported, never silently dropped. Lower rev:
  no-op. Search and usage totals see only the current rev; totals are
  recomputed from committed rows after every replace.
- Metadata merge is monotonic: `completed` never goes false, `branches` union,
  token totals recomputed from committed messages, `last_activity_at` = max
  message ts, `received_at` = server now.
- Response: `202 {chunkId, committedThrough}` where `committedThrough` is the
  highest seq below which all seqs are present. Client advances its delivery
  cursor from `chunkId` acknowledgement, not from a max seq.
- Backpressure: 429 with `Retry-After`; server bounds concurrent ingest.

### Read contracts

Every route documents request, response, defaults and hard caps.

- `POST /api/v1/search`: grammar per `docs/search.md`: terms AND-ed, `"phrase"`,
  `NOT x` and `-x`, `x OR y` and `x | y`, precedence NOT > AND > OR, escaping
  rules, terms compiled to `to_tsquery` with `simple` config (decide vs
  `english` on fixtures). Message-level match, session-level grouping ranked
  by best hit with deterministic tie-break (score, ts desc, session id).
  Filters: remote, author, branch, since/until, kind, mine. `regex: true` uses
  `~` or `~*` per `caseSensitive`, Postgres dialect documented, invalid pattern
  400, statement timeout → 408 with no results and a hint to narrow the
  filters (a cancelled statement returns no rows). Cursor
  pagination; `context: N` bounded neighbours; snippets escaped, generated
  only for returned hits.
- `GET /api/v1/sessions`: filters remote, author, branch, since/until, mine,
  parent, includeChildren; cursor pagination; returns meta, counts, tokens,
  `childCount`, agents rollup, `lastPrompt`, `lastReply`, current summary.
- `GET /api/v1/sessions/{idOrPrefix}`: `from`, `to`, `around`+`context`,
  `last`, `kind`, `maxChars`; prefix resolution scoped to the org, 404 / 409.
- `GET /api/v1/changes?since=<cursor>`: ingest-order change feed (receipt
  cursor, not message ts) for `tail`; replaces timestamp watermarks.
- `GET /api/v1/usage`, `GET /api/v1/remotes`.
- `DELETE /api/v1/sessions/{id}`: owner only; deletes descendants, writes
  tombstones for each.
- Org and members: `GET /orgs/me`, `GET/POST/DELETE /orgs/me/invites`,
  `GET /orgs/me/members`, `PATCH /orgs/me/members/{userId}` (role, admin only),
  `DELETE /orgs/me/members/{userId}`.
- Tokens: `POST/GET/DELETE /me/tokens`.
- Auth: `GET /auth/providers`, local login/logout/register-by-invite/password
  reset, OIDC start/callback. Rate limits on all credential endpoints.
- `GET /config`: enabled providers, app URL, feature flags.

Errors: one problem-details shape, documented per route.

## Gate 3 — vertical slice

Exit: one harness (Claude Code) captured by the real hook → scrubbed durable
spool → authenticated ingest → list and search → viewer, running from the root
`compose.yml`, with kill/restart and offline tests passing.

- Client capture state machine (`docs/protocol.md`):
  1. **Hook** (bounded, `async: true` where the harness supports it): read the
     event, resolve project key, take the per-session lock with a bounded wait
     and stale-owner recovery, read complete new records from the capture
     cursor (partial final line left for next time), map source event ids to
     seqs, scrub, write a spool chunk atomically (temp + rename), advance the
     capture cursor atomically, release the lock, spawn the uploader if none is
     running, exit 0. No network, no retries, no downloads inside the hook.
  2. **Uploader** (one per session, lock-held, detached where the platform
     allows): drain spool chunks in order, POST, delete a chunk only on 202 or
     410, back off on 429/5xx, stop after a bounded number of attempts and
     leave the rest for the next drain.
  3. **Drain triggers**: next hook of any session, `SessionEnd` (spool only if
     the budget is tight, then spawn the uploader), `openhivemind sync`,
     `doctor`.
  State is namespaced by server, org, harness and session under
  `~/.local/state/openhivemind/`.
  **Crash recovery**: per-session capture state is one record: transcript
  cursor, next seq, source-event-id → seq map, and per-seq content hash / rev.
  Every spool chunk carries the state *after* it (cursor range, seq range,
  the map and hash entries it added). On hook start the persisted state is
  reconciled with the chunks present: the newest chunk whose start matches or
  precedes the persisted cursor wins, and cursor, next seq, map and hashes are
  restored from it before reading. A chunk is never re-read from the
  transcript, and seqs after a recovered chunk continue from its seq range.
  State record and chunk are written atomically (temp + rename), chunk first,
  so a crash between them is exactly the case above. Anything that still
  duplicates is absorbed by the replay contract.
  **Storage full**: the spool has a hard cap per server. At the cap capture
  pauses for new chunks (the cursor stays put) and the session is marked
  paused; `doctor` reports "capture paused, N chunks pending"; only
  acknowledged chunks are ever deleted. Resuming is a capture step, not just an
  upload: after a drain frees space, the uploader, `sync` and `doctor` re-run
  capture on every paused session whose transcript still exists. If the
  transcript is gone (harness cleanup, retention) the gap is permanent; the
  session is marked `gap` in its spool state and `doctor` reports it. "Nothing
  is lost" holds only while the transcript remains on disk. Disk-full writes fail the hook cleanly without
  moving the cursor. Truncated or replaced transcripts (size below cursor,
  changed inode) restart the cursor at 0 and rely on replay. Ambiguous HTTP
  outcomes (timeout after send) are resolved by the idempotent replay
  contract.
- Server: migrations as reviewed Drizzle Kit SQL, run by an explicit
  `openhivemind migrate` step in the container entrypoint before the server
  starts; the server refuses to start on a pending or failed migration.
  Readiness endpoint, graceful shutdown.
- Viewer: login, sessions list, session feed with deep link. Generated client
  only.
- Tests: kill the hook mid-write, kill the uploader mid-POST, offline for an
  hour then online, concurrent hook + beam on the same session, SessionEnd
  drain, tenant isolation, tombstone then late retry, roots/exclude honoured
  on resolved paths (symlink and worktree cases).

## Gate 4 — features

Exit: all v1 features implemented against the Gate 2 contracts; tests green.
Shared schemas change only through deliberate contract changes, not ad hoc
edits from feature work.

- **Server**: search grammar and ranking, regex route with budgets, changes
  feed, usage aggregation, org/member/invite routes, retention sweep (activity
  age, not receipt time; rejects expired historic ingest; batched deletes;
  tombstone lifetime), indexes from measured query plans on realistic data.
- **Client**: Codex and opencode parsers from fixtures; `setup` (login,
  `doctor`, opencode plugin entry; see `docs/protocol.md` § Installation),
  `login`, `doctor`, `sync`; read commands `search`, `sessions`, `today`,
  `fetch`, `show`, `tail` (changes cursor), `usage`, `share`, `purge`, `local`,
  `beam` (discovery, resume, shared identities with live capture, bounded
  concurrency, permanent-error handling). Each command: source of data,
  bounded output, server calls, acceptance test. Plugin manifests for the
  three harnesses; skills `search`, `share`, `gist`, `setup`. `gist` is a
  print-only skill: the agent writes a 10–15 line brief ending with the `show`
  command for the current session; nothing is stored and no CLI subcommand
  exists, the brief reaches the hive as an ordinary assistant turn.
- **Viewer**: delete own session (with descendants, confirm dialog), search
  with snippets and highlight, subagent tree and agents
  cell, summary card, prompts-only and tool-calls-only toggles,
  usage page, tokens page, org admin (members, invites, roles). Playwright
  smoke: login, list, open, search, mint token, invite.

## Gate 5 — integration and hardening

Exit: definition of done met and recorded.

- Load test: onboarding burst (N developers × M sessions, chunk mix from real
  sizes), concurrent search; record corpus, concurrency, peak RSS, p95 against
  targets set before the run.
- Outage drills: Postgres restart under ingest, server restart with pending
  migrations, client offline replay.
- Privacy audit: grep payloads, spool, logs and fixtures for the scrub corpus.
- Clean-machine installs: marketplace plugin, packed tarball, compose from a
  fresh clone.
- Docs: `self-host.md` (compose, first admin, OIDC env, retention, backups and
  their expiry), `protocol.md`, `search.md`, `privacy.md`.
- Release: npm publish of `openhivemind` and image to GHCR on tag.
- Two-laptop acceptance run.

## Out of scope

SCIM, SAML, SSO enforcement, audit log (ADR 0001); GitHub login as its own
provider (later); enrichment, graph, traces (ROADMAP); Windows client.

## Open items to settle in Gate 1

- `simple` vs `english` FTS configuration, measured on fixtures.
- `pg_trgm`: required (ADR 0002 lists it) or optional with slower regex.
- ~~opencode capture mechanism~~ resolved (docs/protocol.md): a minimal
  in-process plugin spawns the hook on `session.idle`; the parser reads
  SQLite via `node:sqlite`; upserts are handled by content-hash re-send.
- Codex async hooks did not survive one-shot `codex exec` in discovery; the
  drain path never depends on async completion.
