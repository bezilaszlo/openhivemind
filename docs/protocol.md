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

Tests in `packages/shared`: each rule above, plus a local-path remote
(`/srv/git/x.git` → `/srv/git/x`, allowed; it groups only that machine).

## Common hook contract

Every harness adapter produces the same events for the capture state machine:

- `turn` — an assistant turn finished; carries `sessionId`, `transcriptPath`
  (or an equivalent locator), `cwd`, harness `source`, harness version.
- `session-end` — the session is closing; same fields plus a `reason`.

The adapter is responsible for finding the transcript from the event, nothing
else. Parsing, scrubbing, spooling and upload are harness-neutral.

## Capture state machine

See `docs/plans/mvp.md` Gate 3 until this section is written from the
implementation.

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
Subagent files are discovered from the transcript directory on each turn and
carry their own cursors.

## Harness: Codex CLI

Verified 2026-09-05 on codex-cli 0.153.4 (docs + 37 local rollouts + six live
`codex exec` runs with logging hooks in a scratch `CODEX_HOME`).

| Topic | Finding |
| --- | --- |
| Transcript | `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<threadId>.jsonl`; UUIDv7-shaped ids; every line has `timestamp` and a contiguous `ordinal` |
| Line types to keep | `session_meta` (cwd, cli_version, model_provider, `git{commit_hash,branch,repository_url}`, `parent_thread_id`/`forked_from_id`), `response_item` with payload `message` (user `input_text` / assistant `output_text`), `custom_tool_call` (`name`, `input`), `function_call` (`name`, `arguments`), `compacted`, `token_usage_record`, `turn_context` (model per turn). Drop `reasoning` (encrypted), `*_output`, `event_msg`, `world_state` |
| Usage | `token_usage_record` `{turn_id, usage, turn_token_usage, thread_token_usage}`; also `event_msg/token_count` with cumulative + last. `input_tokens` includes cached; subtract `cached_input_tokens` to match Claude semantics |
| Compaction | Top-level `compacted` `{message, replacement_history, window_*}`, appended |
| Subagents | Separate rollout files: `session_meta.id` = child thread, `session_meta.session_id` = parent, `thread_source` ∈ {subagent, guardian_review, …}, `subagent_history_start_ordinal`; parent `session_meta` copied into the child file |
| Append-only | Yes; `compacted` appends; resume reuses id and file (`SessionStart.source = resume`) |
| Title | No field; first user message, client side |
| Hook stdin | All events: `session_id, transcript_path, cwd, hook_event_name, model, permission_mode` (+ `turn_id`). `Stop` adds `stop_hook_active, last_assistant_message`; `SessionEnd` adds `reason`. `transcript_path` is populated on 0.153.4 although the docs say otherwise; keep the filename fallback `rollout-*-<session_id>.jsonl` |
| Config | `~/.codex/hooks.json` or `[[hooks.<Event>.hooks]]` in `config.toml`; repo-local `.codex/` layers if trusted; `[features] hooks = true` default |
| Async | `"async": true`, ≤ 8 concurrent, delivered at the next safe checkpoint. **A `sleep 5` async hook did not complete under one-shot `codex exec`**: the process was reaped on exit. Treat async as best effort; the drain path must not depend on it |
| SessionEnd | Always synchronous, default 1 s, hard cap 3 s |
| Plugin | `.codex-plugin/plugin.json`, `hooks/hooks.json` at plugin root, `skills/`, `PLUGIN_ROOT` / `PLUGIN_DATA` env (Claude-prefixed aliases too); marketplace at `.agents/plugins/marketplace.json`. Open issues #16430 / #17532 report plugin-bundled and repo-local hooks not firing in older versions; verify on install via `doctor` |

Adapter: `Stop` → `turn`; `SessionEnd` → `session-end` (spool only, ≤ 1 s).
Capture cursor: byte offset. Child rollouts are discovered by scanning the
day directory for files whose `session_meta.session_id` equals the parent.

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
`docs/plans/mvp.md` Gate 2). Same seq and rev with a different hash remains a
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
| Claude Code | Native plugin only: `/plugin marketplace add` + `/plugin install openhivemind`. Ships hooks and the four skills under the `openhivemind:` namespace. The `setup` skill runs `openhivemind setup <url>` |
| Codex CLI | Native plugin only, same layout. `doctor` verifies that bundled hooks fire (issues #16430 / #17532); if not, it tells the user to upgrade Codex. No config patching by us |
| opencode | No marketplace. `openhivemind setup` appends the `openhivemind-opencode` npm name to `opencode.json` `plugin[]`, the documented install path; skills are installed as opencode command files by the same step |

`openhivemind setup <url>`: browser login, PAT stored, `doctor`, and the
opencode entry above. Nothing else. Flags: `--read-only` (no capture),
`--harness <name>`.

Skills alone are also publishable as an Agent Skills repo (`npx skills add
openhivemind/openhivemind`, skills.sh) for editors we do not capture from.
Optional extra, never the primary path: it installs no hooks.

## Fixtures

`fixtures/<harness>/` holds one synthetic transcript per harness covering every
line and block type in the tables above, with placeholder text, plus the golden
normalised output. Real sessions are never committed.
