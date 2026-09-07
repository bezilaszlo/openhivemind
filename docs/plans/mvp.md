# MVP implementation plan

Target: ROADMAP v1. Stack per ADR 0002; identity line per ADR 0001.

Frontend visual system, components and screen behavior: [design plan](frontend-design.md).

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

## Repository layout

Four workspace packages, one level of subdirectories. Create directories when
a gate needs them, not as empty scaffolding.

```text
openhivemind/
├── AGENTS.md, README.md, VISION.md, ROADMAP.md, LICENSE
├── package.json, pnpm-workspace.yaml, .nvmrc, tsconfig.base.json, lefthook.yml
├── compose.yml, Dockerfile     # app + Postgres; entrypoint runs migrate then serve
├── .github/workflows/          # check, integration, pack, release
├── shared/src/
│   ├── schemas/                # TypeBox API + domain schemas; the contract
│   ├── parsers/                # transcript → normalised messages, per harness
│   ├── privacy/                # scrub rules, ignore patterns
│   ├── project/                # remote normalisation, project key
│   └── search/                 # query grammar → AST (SQL stays in backend)
├── backend/
│   ├── src/
│   │   ├── app.ts, server.ts   # build app / start, readiness, shutdown
│   │   ├── routes/             # one file per route group, imports shared schemas
│   │   ├── auth/               # Better Auth bridge, PATs, auth context
│   │   ├── db/                 # Drizzle schema (incl. auth), retention, migrations/
│   │   └── search.ts, ingest.ts, …   # services as flat modules
│   └── test/                   # integration against real Postgres, load workload
├── frontend/
│   └── src/routes/, src/components/, src/api.ts   # typed fetch over shared schemas
├── client/
│   ├── src/
│   │   ├── commands/           # one file per CLI command
│   │   ├── harnesses/          # Claude Code, Codex, opencode adapters
│   │   └── capture.ts, spool.ts, upload.ts, api.ts, config.ts
│   ├── plugins/                # native plugin sources: claude-code/, codex/, opencode/
│   ├── skills/                 # search, share, gist, setup (canonical copies)
│   └── test/                   # crash/offline replay, CLI acceptance, pack check
├── fixtures/                   # claude-code/, codex/, opencode/, scrub/ + goldens
└── docs/                       # decisions/, plans/, protocol, privacy, search, self-host
```

Rules:

- Apps depend on `shared`; never on each other. `shared` has no filesystem,
  network, database or process side effects.
- Contract: `shared/schemas` is imported by backend routes, frontend and CLI.
  OpenAPI is served at runtime from the same schemas, never committed.
- Tests: unit tests sit beside their module as `*.test.ts`. Package `test/`
  holds integration and acceptance scenarios that need Postgres, a temp HOME
  or a packed tarball. Frontend components are tested with Vitest and
  Testing Library; no browser e2e in the MVP. Pack and load are CI jobs over
  those directories, not extra trees. Database tests create a fresh, migrated,
  run-owned database and remove it afterwards. Local runs work against compose
  Postgres without environment configuration; CI uses its Postgres service.
  Tests are isolated by rollback when they share one transaction; auth, replay,
  concurrency and other commit-dependent scenarios use clean-table isolation.
  Deterministic `drizzle-seed` fixtures provide users, organisations, PATs and
  sessions with schema-checked overrides; no custom factory framework.
  A small rollback helper covers transaction-sharing tests. Use the already
  running compose Postgres, not testcontainers.
- Plugin directories are packaging sources; assembly copies the built client
  and the canonical skills into each harness's native layout (opencode reads
  the same `<name>/SKILL.md` shape, so they are copied unchanged). Runtime
  state never lives in the repo.

## Gate 1 — foundation and discovery

Exit: workspace and gates run green in CI; harness matrix and fixtures
committed; auth library decided; normalisation and privacy rules written;
`docs/search.md` written; data model reconciled with the generated Better
Auth schema (done 2026-09-05).

- pnpm workspace: `backend/`, `frontend/`, `client/`, `shared/`,
  `fixtures/`. Root `compose.yml` (DoD is `docker compose up` at the root) with
  a persistent DB volume; `Dockerfile` at the root.
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
- **Privacy rules**: `docs/privacy.md`, tested by the scrub regression.

## Gate 2 — contract slice

Exit: every schema in `docs/protocol.md` exists as TypeBox in `shared/schemas`, the server
serves OpenAPI derived from them without a database, frontend and CLI compile
against them, and the contract tests pass against stub handlers. Better Auth
is proven before anything is built on it: integration tests green, through
the Fastify bridge, for local register-by-invite, OIDC login against a local
mock issuer, first-user org bootstrap and PAT mint. If they cannot be made to
pass on the pinned version, ADR 0003 caveat 10 applies before Gate 3.

Contracts live in `docs/protocol.md` (data model, ingest, read routes,
compatibility, client wrapper); this gate makes them exist as code. Database
integration tests prove fresh-migration setup, per-test isolation and cleanup;
no integration test clears a developer's application database.

## Gate 3 — vertical slice

Exit: one harness (Claude Code) captured by the real hook → scrubbed durable
spool → authenticated ingest → list and search → viewer, running from the root
`compose.yml`, with kill/restart and offline tests passing.

- Client: capture state machine per `docs/protocol.md`, Claude Code adapter.
- Server: migrations as reviewed Drizzle Kit SQL, run by an explicit
  `openhivemind migrate` step in the container entrypoint before the server
  starts; the server refuses to start on a pending or failed migration.
  Readiness endpoint, graceful shutdown. `GET /metrics` (Prometheus text):
  ingest latency histogram, rejections by reason, DB pool in-use/waiting,
  retention sweep failures, search latency. No author labels, no content.
- Viewer: login, sessions list, session feed with deep link, through the
  shared-schema fetch wrapper only.
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
  usage page, tokens page, org admin (members, invites, roles). Component
  tests for list, feed, search and admin forms; manual smoke in the two-laptop
  run.

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
- ~~`pg_trgm`~~ required; one supported deployment, the migration creates
  the extension. Regex budgets stay: a pattern with no extractable trigrams
  still scans the index.
- ~~opencode capture mechanism~~ resolved (docs/protocol.md): a minimal
  in-process plugin spawns the hook on `session.idle`; the parser reads
  SQLite via `node:sqlite`; upserts are handled by content-hash re-send.
- Codex async hooks did not survive one-shot `codex exec` in discovery; the
  drain path never depends on async completion.
