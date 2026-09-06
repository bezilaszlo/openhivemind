# Capture protocol

Status: Gate 1 draft. Harness sections are filled from verified discovery
against installed versions; each section states the version it was checked on.

## Project key

The project key is the normalised `origin` remote of the git checkout the
session ran in. It is the only grouping key; folder layout on a laptop never
matters.

Resolution:

1. `git -C <event cwd> remote get-url origin`, 5 s timeout, no network. The
   event cwd is the one the harness reports for the session, not the hook
   process cwd.
2. Worktrees and nested checkouts resolve naturally: git answers for the
   checkout that owns `cwd`.
3. No git repo, no `origin`, or git missing: the session is not captured. The
   hook exits 0 silently; `doctor` and `local` report the reason so the
   developer can see why a session is absent.

Normalisation, applied in order:

1. Trim whitespace.
2. Drop the scheme (`ssh://`, `https://`, `git://`, `git+ssh://`, ...).
3. Drop userinfo before `@` (this removes embedded credentials; they are
   never sent).
4. SCP-style `host:path` becomes `host/path`; a `:port/` after the host is
   dropped.
5. Strip trailing `/` and a trailing `.git`.
6. Lowercase host and path. Forge paths on GitHub, GitLab, Bitbucket and
   Gitea are case-insensitive, and a mixed-case alias splitting one project
   into two is the worse failure.

Result shape: `host/owner/repo` (more segments allowed for nested groups,
e.g. `gitlab.com/group/sub/repo`). Examples that all normalise to
`github.com/alvicom/demo`:

```
git@github.com:Alvicom/Demo.git
ssh://git@github.com:22/Alvicom/Demo
https://user:token@github.com/Alvicom/Demo/
GitHub.com/alvicom/demo
```

Tests in `shared`: each rule above, plus a local-path remote
(`/srv/git/x.git` → `/srv/git/x`, allowed; it groups only that machine).

## Common hook contract

Every harness adapter produces the same events for the capture state machine:

- `turn` — an assistant turn finished; carries `sessionId`, `transcriptPath`
  (or an equivalent locator), `cwd`, harness `source`, harness version.
- `session-end` — the session is closing; same fields plus a `reason`.

The adapter is responsible for finding the transcript from the event, nothing
else. Parsing, scrubbing, spooling and upload are harness-neutral.

## Capture state machine

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
   `doctor`. Every drain first re-runs capture on each session whose
   transcript grew past its cursor (or changed inode) and on each paused
   session: a harness writes the last turn after its own hook has read the
   file, so the drain path, not a further turn, is what closes the tail.

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
is lost" holds only while the transcript remains on disk. Disk-full writes
fail the hook cleanly without moving the cursor. Truncated or replaced transcripts (size below cursor,
changed inode) restart the cursor at 0 and rely on replay. Ambiguous HTTP
outcomes (timeout after send) are resolved by the idempotent replay
contract.

## Harness: Claude Code

Verified 2026-09-05 on Claude Code 2.1.259 (docs + local corpus + three live
Haiku runs with logging hooks in a scratch repo).

| Topic | Finding |
| --- | --- |
| Transcript | `~/.claude/projects/<cwd with / → ->/<sessionId>.jsonl`; UUIDv4 session id; one constant id per file |
| Subagents | `<projectDir>/<sessionId>/subagents/agent-<agentId>.jsonl` + `.meta.json` `{agentType, description, toolUseId, spawnDepth}`; agentId 17 hex chars |
| Line types to keep | `user`, `assistant`, `system` (`compact_boundary` subtype). All other top-level types (`attachment`, `last-prompt`, `file-history-*`, …) are harness bookkeeping; pass through unknown types, never fail on them |
| Content blocks | assistant: `text`, `tool_use`, `thinking`; user: string or `[{tool_result}|{text}]` |
| Usage | `message.usage` on each `assistant` line, per message, not cumulative; `message.model` per assistant line |
| Compaction | `system` line, subtype `compact_boundary`, with `compactMetadata` and `logicalParentUuid`, followed by a `user` line with `isCompactSummary: true`. Old lines stay on disk |
| Linkage | `uuid` / `parentUuid` chain; `timestamp` ISO-8601 ms UTC; `cwd`, `gitBranch`, `version` on most lines |
| Append-only | Yes (first 174 KB hash-identical before and after a resume that grew the file) |
| Resume | Same session id and file; fresh run gets a new id and file. `/clear` not observable non-interactively |
| Stop stdin | `session_id, transcript_path, cwd, prompt_id, permission_mode, hook_event_name, stop_hook_active, last_assistant_message, background_tasks, session_crons` (no `reason`/`effort` despite docs) |
| SessionEnd | Did not fire on `-p` or `-p --resume`; fired on `claude stop <id>` with `reason: other`. Shared 1.5 s budget, raisable to 60 s. Never rely on it for delivery |
| Async | `async: true` on command hooks, no timeout enforced; `asyncRewake: true` wakes the agent on exit 2 |
| Plugin | `.claude-plugin/plugin.json` (only file allowed in that dir), `hooks/hooks.json`, `skills/<name>/SKILL.md`, marketplace.json; `${CLAUDE_PLUGIN_ROOT}`; hook command may be `node "${CLAUDE_PLUGIN_ROOT}/dist/hook.mjs"`; plugin-local `package.json` deps are installed with `npm install --ignore-scripts` |

Adapter: `Stop` (async) → `turn`; `SessionEnd` → `session-end` (spool only).
Capture cursor: byte offset; partial trailing line left for the next read.
The root session's title is derived from its first prompt: the first
non-empty line, whitespace-collapsed and clamped to about 120 characters on a
word boundary with an ellipsis, never the raw prompt — a long pasted brief
does not become a multi-kilobyte title. An explicit `event.title` (used by
subagents and future harnesses) gets the same clamp. Once set, a session's
title never changes.
Subagent files are discovered from the transcript directory on each turn and
on every drain re-capture, and carry their own cursors and spool state exactly
like the root. Nesting is flattened on purpose: every child, at any depth, is
its own `agent_session` with `parent_external_id` set to the **root** session's
external id and `spawn_depth` from its `.meta.json` (default 1); the tree shape
lives in `spawn_depth`, not in a chain of parents. `title` comes from the
sidecar `description`, `model_explicit` from a non-empty sidecar `model`, and
`models` from the child transcript. A child discovered after the root session
completed is still captured on the next drain, and the hook hands the spool to
the uploader before it scans for children, so a harness that reaps the hook
when the session exits cannot lose the hand-off. The parent transcript is left
alone: its `Agent` tool-call lines already record the spawn. The child's
external id is `<root session id>:<agent id>`.

The plugin's hook command is `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" hook`,
a self-contained bundle that runs without `node_modules`.

## Harness: Codex CLI

Verified 2026-09-05 on codex-cli 0.153.4 (docs + 37 local rollouts + six live
`codex exec` runs with logging hooks in a scratch `CODEX_HOME`), and re-verified
2026-09-06 on the same version with the native plugin installed from this
repository's marketplace (three live `codex exec` runs, the CLI's own embedded
hook JSON schemas, and its `hooks/list` app-server route).

| Topic | Finding |
| --- | --- |
| Transcript | `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<threadId>.jsonl`; UUIDv7-shaped ids; every line has `timestamp` and a contiguous `ordinal` |
| Line types to keep | `session_meta` (cwd, cli_version, model_provider, `git{commit_hash,branch,repository_url}`, `parent_thread_id`/`forked_from_id`), `response_item` with payload `message` (user `input_text` / assistant `output_text`), `custom_tool_call` (`name`, `input`), `function_call` (`name`, `arguments`), `compacted`, `token_usage_record`, `turn_context` (model per turn). Drop `reasoning` (encrypted), `*_output`, `event_msg`, `world_state` |
| Usage | `token_usage_record` `{turn_id, usage, turn_token_usage, thread_token_usage}`; also `event_msg/token_count` with cumulative + last. `input_tokens` includes cached; subtract `cached_input_tokens` to match Claude semantics. The record is written after the assistant message, often in a later hook run: emit the message with `usage: null`, then re-emit it with `rev + 1` once the record is read (revision contract, § Ingest API). Per-seq hash covers usage, not only text |
| Compaction | Top-level `compacted` `{message, replacement_history, window_*}`, appended |
| Subagents | Separate rollout files: `session_meta.id` = child thread, `session_meta.session_id` = parent, `thread_source` ∈ {subagent, guardian_review, …}, `agent_path` / `agent_nickname`. The child file **opens with the parent's history and the parent's `session_meta` copied in**, all below `subagent_history_start_ordinal`; only the first `session_meta` and records from that ordinal on belong to the child, and everything below it would otherwise be captured twice. A subagent receives its task as an encrypted `agent_message`, never as a prompt, so `agent_path` is its only title |
| Append-only | Yes; `compacted` appends; resume reuses id and file (`SessionStart.source = resume`) |
| Title | No field. The **first** user message is not the developer's: Codex opens every thread with `agents_md.instructions` and `environments.environment_context` blocks, and injects an `environment_context` refresh on later turns. `internal_chat_message_metadata_passthrough.content_item_kinds[i]` labels each content block; only `user.text` is typed by the developer. Injected blocks are dropped and the title is derived from the first `user.text` block the same way as the root session's title above: its first non-empty line, whitespace-collapsed and clamped to about 120 characters on a word boundary, never the raw block |
| Hook stdin | Per the CLI's embedded schemas: every event carries `session_id, cwd, hook_event_name, transcript_path` (nullable). `Stop` adds `model, permission_mode, turn_id, stop_hook_active, last_assistant_message`; `SessionEnd` adds only `reason` (const `other`) and carries **no** `model`, `permission_mode` or `turn_id`. `transcript_path` is populated on 0.153.4 although the docs say otherwise; keep the filename fallback `rollout-*-<session_id>.jsonl` |
| Hook events | `PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, Stop, SubagentStart, SubagentStop, Interrupt` |
| Hook trust | Every hook — plugin-bundled, user or repo-local — is discovered as `untrusted` and is **skipped in silence** until it is trusted: nothing runs, nothing is logged, and `codex doctor` says nothing. Trust is `[hooks.state."<key>"] enabled = true, trusted_hash = "sha256:…"` in `config.toml`, keyed `<pluginId>:hooks/hooks.json:<event>:<group>:<index>` for plugin hooks and `<path>:<event>:<group>:<index>` otherwise; the TUI writes it. `codex exec` cannot grant it. The app-server route `hooks/list` reports every hook with its `trustStatus` and `currentHash`, which is the value to trust |
| Config | `~/.codex/hooks.json` or `[[hooks.<Event>.hooks]]` in `config.toml`; repo-local `.codex/` layers if trusted; `[features] hooks = true` default |
| Async | `"async": true`, ≤ 8 concurrent, delivered at the next safe checkpoint. **A `sleep 5` async hook did not complete under one-shot `codex exec`**: the process was reaped on exit. Treat async as best effort; the drain path must not depend on it |
| SessionEnd | Always synchronous, default 1 s, hard cap 3 s |
| Plugin | `.codex-plugin/plugin.json`, `hooks/hooks.json` at plugin root, `skills/`; `${PLUGIN_ROOT}` expands to the installed copy under `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>`. The manifest rejects unknown fields — `hooks` among them — and requires `name`, semver `version`, `description`, `author.name` and a full `interface` block; `codex plugin marketplace add <repo>` + `codex plugin add <plugin>@<marketplace>` install from a repo-root `.agents/plugins/marketplace.json`. Bundled hooks **are** discovered on 0.153.4 (the `plugin_hooks` feature flag reads `removed` but does not gate them); they fire once trusted, which is what issues #16430 / #17532 are seen as. `doctor` reports it |

Adapter: `Stop` → `turn`; `SessionEnd` → `session-end` (spool only, ≤ 1 s).
Capture cursor: byte offset. Child rollouts are discovered by scanning the
day directory for files whose `session_meta.session_id` equals the parent; a
child's external id is its own thread id, its `spawn_depth` is 1 because Codex
records no depth chain, and its title is `agent_path`. Under one-shot `codex exec` the async `Stop` hook
is reaped before it runs, so in practice the synchronous `SessionEnd` hook is
what captures the thread, and the drain path closes anything it missed.

## Harness: opencode

Verified 2026-09-05 on opencode 1.18.29 (repo source at `anomalyco/opencode`,
live schema of the local SQLite DB, two free-model `opencode run` turns with a
probe plugin in an isolated XDG dir).

| Topic | Finding |
| --- | --- |
| Storage | SQLite `~/.local/share/opencode/opencode.db` (WAL), Drizzle. Tables `project`, `session` (`parent_id`, `title`, `directory`, `time_*`), `message` (`role`, `model`, `cost`, `tokens{input,output,reasoning,cache{read,write}}`, `time`), `part` (`text`, `reasoning`, `tool` with `state{input,output,status}`, `step-start`, `step-finish`, `compaction`, `subtask`), `event` |
| Write model | **Upsert**, not append. Rows change in place while streaming; ids are stable; `time.updated` on session and message |
| Compaction | `message` of type `compaction` with `summary`; `CompactionPart.tail_start_id`; old rows kept |
| Subagents | Child `session` rows with `parent_id`; parent carries a `subtask` part |
| Title | `session.title`, defaulted, updated later by the model |
| Hooks | None. No JSON hooks config exists |
| Plugin | In-process, `.opencode/plugins/*.{js,ts}` or an npm name in `opencode.json` `plugin[]`. Events: `session.idle`, `session.updated`, `message.updated`, `message.part.updated`, `tool.execute.before/after`, `chat.message`, `experimental.text.complete`, plus raw `message.part.delta` streams. Fire-and-forget; can spawn subprocesses |
| Server/SDK | `opencode serve` with OpenAPI; `GET /event` SSE; `GET /session/:id/message`, `/children`; `@opencode-ai/sdk` |
| Isolation for tests | Honours `XDG_DATA_HOME` etc.; free models via `opencode/*-free` |

Adapter: a minimal plugin (`openhivemind-opencode`) that on `session.idle`
spawns `openhivemind hook` with a synthetic `turn` event `{sessionId, dbPath,
cwd: session.directory, source: "opencode"}`. The parser reads the session's
`message` and `part` rows (`node:sqlite`, read-only, WAL) and emits messages
whose capture cursor is the max `message.time.updated` seen, re-emitting rows
updated since. Upserts mean a message can change after first capture: the
client keeps a content hash per emitted seq and, when it changes, re-sends the
message with `rev + 1`; the server replaces the row (revision contract in
§ Ingest API below). Same seq and rev with a different hash remains a
409. No `session-end` event; the drain runs on the
next idle of any session, `sync`, or `doctor`.

Delivered relative to Claude Code: per-idle rather than per-turn capture,
usage per message, subagents, compaction, title. Not delivered: nothing in the
MVP scope.

## Installation

Capture and skills are installed together; a harness without capture is the
exception (`setup --read-only`), not the default. The client never edits a
harness's hooks or settings files: where the harness has a plugin system, that
system owns install, update, disable and uninstall.

| Harness | Path |
| --- | --- |
| Claude Code | Native plugin only: `/plugin marketplace add openhivemind/openhivemind` + `/plugin install openhivemind`. The marketplace manifest is `.claude-plugin/marketplace.json` at the repository root and points at `client/plugins/claude-code`, whose `dist/` and `skills/` the client build assembles. Ships hooks and the four skills under the `openhivemind:` namespace. The `setup` skill runs `openhivemind setup <url>` |
| Codex CLI | Native plugin only: `codex plugin marketplace add openhivemind/openhivemind` + `codex plugin add openhivemind@openhivemind`. The manifest is `.agents/plugins/marketplace.json` at the repository root and points at `client/plugins/codex`, whose `dist/` and `skills/` the client build assembles. Codex runs the bundled hooks only once they are trusted, which is granted in the TUI; until then they are skipped silently. `doctor` reports whether the plugin is installed and whether its hooks have ever fired (issues #16430 / #17532). No config patching by us |
| opencode | No marketplace. `openhivemind setup` appends the `openhivemind-opencode` npm name to `opencode.json` `plugin[]`, the documented install path; skills are installed as opencode command files by the same step |

`openhivemind setup <url>`: browser login, PAT stored, `doctor`, and the
opencode entry above. Nothing else. Flags: `--read-only` (no capture),
`--harness <name>`.

Implemented today: `setup <url> --token <pat>` and `login --server <url>
--token <pat>` (the token is read from stdin when the flag is absent or `-`),
both taking repeatable `--root` / `--exclude` and `--read-only`, and storing
the resolved real paths in a mode-600 config. Browser login and the opencode
entry are not implemented yet. `doctor` reports the config file and its mode,
server reachability and the accepted protocol range, token validity, the
effective roots and exclude lists, whether the Claude Code and Codex
plugins are installed and whether the Codex hooks have fired, invalid ignore
lines, spool size, pending and permanently rejected
chunks, paused and gap sessions, and a recorded "upgrade client" stop. It
exits 2 when a check fails.

Skills alone are also publishable as an Agent Skills repo (`npx skills add
openhivemind/openhivemind`, skills.sh) for editors we do not capture from.
Optional extra, never the primary path: it installs no hooks.

## API contract

Schemas are TypeBox in `shared/schemas`, imported by server routes, frontend
and CLI; never a second hand-maintained contract. OpenAPI is derived at
runtime and served at `/docs`.

## Data model

Auth tables are the ones Better Auth v1.7.2 generates (core + organization
plugin), in Postgres schema `auth`, names kept so upgrades diff cleanly.
Reconciled 2026-09-05 against the CLI built from the v1.7.2 source (the npm
`@better-auth/cli@latest` was 1.4.21 and lacks the 1.7 identity model).

- `auth.user(id, name, email unique, emailVerified, image?)`; global users.
  Email is required by the library, including for OIDC sign-in.
- `auth.account(id, issuer, accountId, providerId, userId, password?,
  tokens…)`; unique (issuer, accountId). Local password lives here
  (providerId `credential`). `accountLinking.enabled: false`: an unknown
  (issuer, accountId) whose email matches an existing user fails to sign in
  rather than linking; a new email creates a user with no membership.
- `auth.session(id, token unique, userId, expiresAt, ipAddress?, userAgent?,
  activeOrganizationId?)`; DB-backed cookie session, CSRF by the library.
- `auth.verification(id, identifier, value, expiresAt)`; password reset.
- `auth.organization(id, name, slug unique, logo?, metadata?)`.
- `auth.member(id, organizationId, userId, role text, createdAt)`; role is a
  plain text column. `creatorRole: "admin"` and a custom access-control set
  limited to `admin|member`, so `owner` never appears. First-user bootstrap
  is our transaction (org + admin member) guarded by a unique constraint;
  `beforeCreateOrganization` rejects any later org.
- `auth.invitation`: **not used**. The plugin requires an email per invite,
  stores the plain id as the token and forces email equality on accept, which
  rules out a copyable open link. Our own table instead:
  `invite(id, org_id, email?, role, token_sha256 unique, expires_at,
  created_by, accepted_by?, accepted_at?)`; single use; accept endpoint is
  ours and creates the `auth.member` row through the library's adapter.
  Optional SMTP sends the same link.
Our tables, schema `public`, FK to `auth.organization.id` / `auth.user.id`:

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

## Ingest API

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

## Read API

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
  parent, includeChildren, and the subagent shape filters `subagents`, `nested`
  (a child at `spawn_depth` 2 or deeper) and `inherited` (a child with no
  `model_explicit`); cursor pagination; returns meta, counts, tokens,
  `childCount`, `lastPrompt`, `lastReply`, current summary and the agents
  rollup. `agents` is null when the session spawned none, otherwise
  `{count, maxDepth, models: [{model, count, inherited}], inputTokens,
  outputTokens}` over the session's children, computed in one grouped query for
  the whole page. Nesting is flattened by the harnesses: a child's
  `parent_session_id` is the root session and `meta.spawn_depth` carries how
  deep it was spawned, so `maxDepth` is the deepest child, `inherited` counts
  children that ran the session's model without asking for one, and the token
  figures cover the children only.
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
- `GET /config`: enabled providers, app URL, feature flags, `protocol`
  (current and minimum accepted version).

Compatibility: every ingest chunk and every CLI request carries
`protocolVersion` (integer, starts at 1). The server accepts the current and
the previous version. Unknown fields are ignored on both sides; missing
required fields are 400. A too-old client gets 426 with the minimum version;
the uploader stops, keeps the spool, and `doctor` reports "upgrade client".
A client newer than the server degrades to the server's version when the
server says so in `/config`, otherwise reports "upgrade server". Spool chunks
are versioned on disk and re-encoded, never dropped, across client upgrades.

Errors: one problem-details shape, documented per route.

## Client wrapper

One function taking a route definition from `shared/schemas`
(method, path, params, request and response schemas). It validates the
response with the compiled TypeBox check and fails loudly on mismatch. No bare
`fetch<T>()` cast anywhere in frontend or CLI.

## Fixtures

`fixtures/<harness>/` holds structurally preserved discovery captures with every
free-form string replaced, plus golden normalised output. Raw real sessions are
never committed. Synthetic parser regressions supplement these captures for
edge cases; see `fixtures/README.md` for provenance and coverage gaps.
