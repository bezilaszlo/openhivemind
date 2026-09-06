# Changelog

## Unreleased

Kept editing test files, `drizzle.config.ts`, `tsup.config.ts`, fixtures or
docs from restarting or resyncing the dev-stack `backend` container: `tsx
watch` now gets explicit `--exclude` globs for test files as a documented
safety net, and `compose.dev.yml`'s Compose Watch rules sync each service's
actual runtime source (`backend/src`, `frontend/src` plus `index.html`,
`public/` and `vite.config.ts`, and `shared/src` for both) instead of whole
package directories with ignore lists, so anything outside that source tree
is never copied into the container at all.

Fixed session titles, prompt text and search still carrying Claude Code's
injected wrapper text (the `local-command-caveat` and `/command` echo ahead of
a `/clear`, or a `system-reminder` block the harness staples onto a memory
recall or hook output) instead of only what the developer actually typed. The
Claude Code parser branch in `shared/src/parsers/index.ts` now drops a whole
user record when the harness flags it `isMeta: true` (the caveat only —
measured against real transcripts, the `/command` echo itself is not
isMeta-flagged), and strips the `system-reminder` and `command-name`/
`command-message`/`command-args` tags independently, wherever and in
whatever order they occur in a record's block, dropping the record if
nothing real is left, mirroring how the Codex branch already drops its
injected `AGENTS.md`/environment blocks. `fixtures/claude-code/session.json`
now opens with a synthetic `/clear` and a trailing reminder so the golden
locks this in.

Fixed a login/API failure when a browser reached the dev stack by a different
loopback spelling than the configured `APP_URL` (e.g. `localhost` vs.
`127.0.0.1`): Better Auth's `trustedOrigins` and the app's own origin checks
(`backend/src/auth/bridge.ts`, `backend/src/services.ts`) now share one
loopback-equivalence helper (`backend/src/auth/origin.ts`) that trusts
`localhost`, `127.0.0.1` and `[::1]` on the same port when the configured URL
is itself loopback; a non-loopback URL keeps the exact single-origin check.
The dev stack's `APP_URL` default is now `http://localhost:5173` to match
what a developer actually types in the browser (`compose.dev.yml`); the Vite
bind address is unchanged.

Fixed `GET /api/v1/config` reporting `providers: ["local"]` unconditionally
even when OIDC is configured; it now derives the list from the same runtime
auth configuration `GET /api/v1/auth/providers` already uses.

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

The entropy scrub no longer exempts a string just because it contains a dot or a
slash. That blanket rule meant any high-entropy secret survived once `.x` or `/x`
was appended to it. Paths, URLs and package names are now recognised by their
structure — words held apart by separators, no single run of letters and digits
long and random enough to be a secret on its own — so real paths stay untouched
while a secret keeps being redacted whatever punctuation is stuck to it. One
visible side effect: lockfile integrity strings (`sha512-<base64>`) now redact
where a slash in the digest used to exempt them, so a scrubbed `pnpm-lock.yaml`
diff looks changed. That is noise, not lost data.

Validation: 46 unit/component/contract tests pass; the latest backend integration
run passed 13 tests. The frontend production build passes. Browser visual review
was unavailable because no browser was connected.

This checkpoint does not implement the full MVP. Packaged CLI capture commands,
native plugin assembly, complete retention/metrics, frontend acceptance and
multi-laptop/load acceptance remain open. No release is ready for publication.
