# Open Hivemind

Shared, searchable history of coding-agent sessions for a team. Self-hosted.

- [VISION.md](VISION.md) — why it exists and what it will never do
- [ROADMAP.md](ROADMAP.md) — what ships when
- [docs/decisions/](docs/decisions/) — why things are the way they are

**Status: MVP implementation in progress.** The workspace, shared contracts,
privacy/search/parser unit tests, API reference and initial local-auth database
integration are runnable. Capture, data routes, OIDC acceptance, the viewer and
release acceptance are unfinished; this is not v1.

## Development

Node 24.20.0 LTS and pnpm 11.25.0 are pinned. `pnpm install` provisions the
workspace Node runtime even when your shell uses Node 26; `.nvmrc` and CI use
that same version. Run `pnpm check`, `pnpm build`, and `pnpm test:pack`.

For database tests, start `docker compose up -d postgres`, then run
`pnpm test:integration`. The harness creates a uniquely named
`openhivemind_test_*` database, applies migrations and drops it at teardown.
`DATABASE_URL` optionally selects another Postgres server (the user needs
CREATEDB); it never selects a database to truncate. Commit-dependent HTTP tests
reset tables only in the run-owned database. Tests sharing a transaction should
use rollback isolation. Use `drizzle-seed` for deterministic, schema-typed fixture data; the rollback
helper lives beside integration tests. No testcontainers are needed.

`docker compose up --build` starts the current development server at
http://localhost:3000 and the runtime API reference at `/docs`. An initial auth
secret is generated in the persistent app-state volume. See
[the implementation plan](docs/plans/mvp.md) for remaining gates.

## How it works

A harness hook fires after each assistant turn, parses the new transcript lines
locally, scrubs secrets locally, and ships prompts, assistant text and one-line
tool calls to the team's server. Tool results and thinking are never sent.

A CLI and agent skills search that history back from inside a session, and
let a session hand itself to a fresh chat with a short brief instead of
compacting. A web viewer renders it all as readable chat for humans.

Harness targets: Claude Code, Codex CLI, opencode. Others can follow; each one
is a parser behind the same hook contract.

## Constraints

- One command to deploy, one Postgres, nothing else to run.
- Free for small teams and open-source projects. MIT.
- No per-person analytics; symmetric read access inside a team; owner-only
  purge; retention as a privacy control.

## Layout

```
backend/     server and API
frontend/    React viewer, typed shared-schema API wrapper
client/      hook, CLI, harness plugin manifests, agent skills
shared/      schemas, parsers, privacy and search grammar
compose.yml  app + Postgres; Dockerfile at the root
docs/        decisions, protocol, search semantics
```

## Origin

Started from Hive Mind, an internal tool built at Alvicom for the same purpose,
rebuilt from scratch as an independent project.
