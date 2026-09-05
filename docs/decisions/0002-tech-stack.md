# 0002 — Tech stack: TypeScript end to end

Date: 2026-09-05. Status: accepted.

## Context

Three surfaces: a hook/CLI that runs on every developer laptop, a server with
search, and a web viewer. Requirements from VISION and ROADMAP: self-hosted with
one Postgres and nothing else, cheap quality gates, contributors from the
agent-tooling world, agents writing most of the code, ingest bursts of
multi-MB requests when a team beams its history.

Market check (2026-09): the harness ecosystem is TypeScript
first (OpenClaw, opencode, Gemini CLI, Cline, Continue, Pi); plugins split
Python/Node; comparable servers split TypeScript/Python with Postgres-only
products being the easiest to self-host. Claude Code and Codex CLI are Node
programs, so Node is present on every target laptop.

Candidates evaluated: Go (footprint, single binary, ingest throughput), Python
(FastAPI or Django; ergonomics, existing internal code), Rust (client only),
Laravel (batteries, no audience here), TypeScript.

## Decision

One language across client, server and web.

| Surface | Choice |
| --- | --- |
| Workspace | pnpm workspaces (isolated `node_modules`, no phantom imports); Node LTS as the only runtime |
| Client (`client/`) | TypeScript CLI published to npm, run as `npx openhivemind`; ships the Claude Code / Codex / opencode plugin manifests and agent skills |
| Server (`backend/`) | Node LTS, Fastify, TypeBox schemas (JSON Schema → OpenAPI and static types), Drizzle + node-postgres, Drizzle Kit migrations as reviewed SQL run once at deploy |
| Web (`frontend/`) | React, Vite, TanStack Router and Query, types imported from `shared/schemas` with a small typed fetch wrapper (no codegen), served as static files by the server |
| Database | PostgreSQL only. Native FTS (`tsvector` generated column + GIN, `ts_rank_cd`, `ts_headline`) and `pg_trgm` for regex |
| Auth | Local email/password + invites and OIDC login behind one provider interface; PATs in an application-owned table, hashed, scoped. Library: Better Auth, pinned, per ADR 0003 |
| Tests / gates | Vitest with real-Postgres integration tests, strict TypeScript, oxlint + oxfmt for lint/format (ESLint-compatible rules, same toolchain family as Vite/Rolldown), one root check command |
| Deploy | One app container (server + built web) and Postgres, via compose |

Contract: the TypeBox schemas in `shared/schemas`, imported by server routes,
web and CLI alike. OpenAPI is derived from them at runtime by
`@fastify/swagger` and served at `/docs` for third-party clients; never
committed.

## Why

- **Shared code where it matters.** Transcript parsers, scrub patterns, API
  types and search grammar are used by client, server and web. One language,
  one test suite for each.
- **Contributor alignment.** The people who write harness plugins and MCP
  servers write TypeScript.
- **Zero-prerequisite client.** Node ships with the harnesses; `npx` is the
  install idiom users already know.
- **Cheap gates.** `tsc` + oxlint + oxfmt + Vitest, configured once.
- **Scratch ergonomics.** Application functions take an explicit DB handle and
  auth context; `tsx` scripts import them directly.

## Rejected

- **Go server.** Best footprint and ingest path, but no ecosystem signal in this
  space, weak scratch ergonomics, and a second language next to the web UI.
  Kept as the escape hatch: the OpenAPI contract and Postgres schema are the
  boundary that makes a later port practical.
- **Python (FastAPI/Django).** Strong ergonomics and batteries, but a
  language split with client and web, and the maintainer dislikes the
  per-project tooling setup.
- **Compiled client (Go/Rust).** Faster hook start and native Windows, at the
  cost of a release matrix and npm/PyPI wrapper packages. Revisit if hook
  latency or Windows becomes a real complaint.
- **tRPC as the only contract.** Locks out non-TS clients and hand-rolled
  scripts.
- **NestJS.** More framework than this service needs.

## Consequences

- Large JSON bodies are parsed on the Node event loop. Measured 2026-09 on a
  real corpus: an 18 MB raw transcript parses in ~150 ms / <100 MB RSS in
  Node, and the filtered payload the server receives is ~3–5 % of raw size. Ingest still needs payload caps, chunked
  uploads, bounded concurrency and batched transactions, plus one load test
  with a representative onboarding burst.
- Hook latency is ~50–100 ms of Node startup per turn; hooks run with the
  harness `async` flag so this never blocks a session.
- Windows support for the client is untested until v1.x.
- If Better Auth fails verification, fall back to hand-rolled local auth plus
  `openid-client` for OIDC behind the same provider interface.
- Bun was considered as package manager and runtime. Rejected for now: a
  second runtime next to Node, and hoisted installs by default. Revisit if the
  server ever moves to Bun as runtime.
