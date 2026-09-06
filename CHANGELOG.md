# Changelog

## Unreleased

Added `openhivemind beam <transcript.jsonl|session-id>`: sends an existing
Claude Code transcript through the same capture and upload path the hook
uses, resolving a bare session id against the known `~/.claude/projects`
directories, capturing subagents, and leaving the session's state resumable
by a later hook. No new idempotency logic was needed — capture's own
per-seq content hashes already make a re-beam of an already-sent session a
no-op, the same way a repeated hook call is.

Added the `search`, `sessions` and `show` read commands to the CLI, with
plain/Markdown output, session-grouped search hits, `--days`-based date
filtering and client-side match windowing for `show`. Updated the `search`
skill with the working recipe and documented the commands in the README.

Initial MVP foundation checkpoint: pnpm workspace on Node 24 LTS, shared wire
schemas and API validation, project normalization, privacy and parser regression
tests, Boolean search grammar, runtime OpenAPI, generated auth schema and initial
Fastify local-auth bridge. Integration runs create and remove their own database;
the packed CLI currently exposes help, version, config and bundled skills.

Added the interactive session viewer and labelled in-memory demo: session list,
reader, safe Markdown, collapsed tool calls, search, usage, tokens, organisation
settings and light/dark styling. Added local-issuer OIDC verification, authenticated
session ingest/read/search/usage/purge routes, revision replay and tombstone tests,
real-capture-derived scrubbed fixtures, and durable capture/recovery primitives.
The login password field has a show/hide toggle and states the minimum length;
auth rejections reach the viewer with their reason. `pnpm dev:stack` runs the
compose stack with hot reload. The production image runs as an unprivileged user
and pre-creates its state directory, so a fresh `app-state` volume is writable;
when that directory is not writable — typically a volume left over from an
earlier root-running image — the server now refuses to start with an explicit
message naming the directory and the ownership fix, instead of a bare EACCES.
`pnpm dev:stack` layers an explicit `compose.dev.yml` that runs the backend and
Vite as separate services with independent logs and watch rules, while
`docker compose up` still deploys the single production container; the Vite API
proxy target is configurable through `VITE_API_PROXY`. That dev backend applies
migrations before starting its watch, so it comes up unattended on a fresh
Postgres volume, and `pnpm dev:db` starts just Postgres for host-native work.

Codex CLI sessions are captured through a native Codex plugin
(`client/plugins/codex`, installed from the repository-root
`.agents/plugins/marketplace.json`): `Stop` becomes a turn, `SessionEnd` closes
the thread, the rollout is read from a byte cursor with the
`rollout-*-<session id>.jsonl` filename fallback, an assistant message first
spooled without usage is re-sent with `rev + 1` once Codex writes its
`token_usage_record`, and subagent and guardian threads in the same day
directory are captured as children of the thread that spawned them. Codex opens
every thread with AGENTS.md, skills and environment context disguised as user
messages; only the block Codex labels `user.text` is kept, so the session title
and the prompt feed are what the developer actually typed. `doctor` now reports
both plugins, and says whether the Codex hooks have ever fired — Codex discovers
them but skips them silently until they are trusted.

Validation: 46 unit/component/contract tests pass; the latest backend integration
run passed 13 tests. The frontend production build passes. Browser visual review
was unavailable because no browser was connected.

This checkpoint does not implement the full MVP. Packaged CLI capture commands,
native plugin assembly, complete retention/metrics, frontend acceptance and
multi-laptop/load acceptance remain open. No release is ready for publication.
