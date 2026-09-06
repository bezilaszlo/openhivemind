<p align="center"><img src="assets/banner.png" alt="Open Hivemind — one memory, every session" width="1280"></p>

# Open Hivemind

Shared, searchable history of coding-agent sessions for a team. Self-hosted.

- [VISION.md](VISION.md) — why it exists and what it will never do
- [ROADMAP.md](ROADMAP.md) — what ships when
- [docs/decisions/](docs/decisions/) — why things are the way they are

**Status: MVP implementation in progress.** The workspace, shared contracts,
privacy/search/parser tests, authenticated data routes, local/OIDC integration
and the interactive viewer are runnable. Claude Code and Codex CLI capture run
end to end through their native plugins, the spool and the uploader; opencode
capture, the read commands and browser login are not implemented yet. Full
release acceptance remains unfinished; this is not v1.

## Capture a Claude Code session

In Claude Code, `/plugin marketplace add openhivemind/openhivemind` then
`/plugin install openhivemind`, or `claude --plugin-dir client/plugins/claude-code`
from a clone. Then connect the laptop to your server:

```
openhivemind setup https://hivemind.example.com --token <personal access token>
openhivemind doctor
```

## Capture a Codex CLI session

`codex plugin marketplace add openhivemind/openhivemind` then
`codex plugin add openhivemind@openhivemind`, or point the marketplace at a
clone. Codex runs the plugin's bundled hooks only after they are
trusted, which is granted from the Codex TUI; until then it skips them without a
word, so run `openhivemind doctor` — it reports whether the plugin is installed
and whether its hooks have ever fired. Connect the laptop with the same `setup` command as above.

`setup` accepts repeatable `--root <dir>` and `--exclude <dir>`; with no
roots, every git checkout with an `origin` remote is captured. The token comes
from the tokens page in the viewer, and is read from stdin when `--token` is
omitted. Each finished turn spools locally and a detached `openhivemind sync`
uploads it; `doctor` reports anything still pending.

## Beam an existing session

`openhivemind beam <transcript.jsonl|session-id>` sends a Claude Code session
that already exists on disk, not just the ones a live hook has seen. Given a
bare session id, it is resolved against every project directory under
`~/.claude/projects`; given a path, that transcript is used directly. It runs
the same capture and upload path as the hook, so a beamed session keeps
uploading normally from a later hook, includes the session's subagents, and
re-running it on an already-beamed session sends nothing new. There is no bulk
or historic-discovery mode yet (see ROADMAP.md); beam one session at a time.

## Frontend preview

Run `pnpm --filter @openhivemind/frontend dev:demo` and open
http://127.0.0.1:5173. The labelled demo provides illustrative sessions for
browsing the reader, search, usage, tokens and organisation screens without login
or capture. Demo changes are in memory and disappear on reload. The regular
`dev` command connects to the real backend through the Vite proxy.

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

The quickest loop runs both apps on the host against Postgres in a container:

```
docker compose up -d postgres
export DATABASE_URL=postgres://openhivemind:development@127.0.0.1:55432/openhivemind
pnpm --filter @openhivemind/backend migrate
pnpm dev
```

`pnpm dev` serves the backend on http://localhost:3000 and Vite on
http://127.0.0.1:5173, which proxies `/api` to it. Nothing in the repo reads a
`.env` file, so `DATABASE_URL` has to be exported or set per command; Postgres is
published on 55432 to stay clear of a local server on 5432, and
`POSTGRES_PASSWORD` overrides the development default on both sides. Rerun the
migrate command whenever migrations change.

`pnpm dev:stack` runs the same loop entirely in containers, layering
`compose.dev.yml` over `compose.yml`: a `backend` service running tsx and a
`viewer` service running Vite from one `openhivemind-dev` image, each with its
own logs and restarting only on its own sources. That backend migrates before
starting its watch, so a fresh Postgres volume needs no manual step. Vite
hot-reloads on http://127.0.0.1:5173 and reaches the backend by service name
through `VITE_API_PROXY`, which also overrides the target for host-side Vite.
Only Vite and Postgres are published, and changing a manifest or the lockfile
rebuilds the dev image.

`docker compose up -d --build` deploys the production shape and nothing else: one
`openhivemind-app` container serving the API and the built viewer on
http://localhost:3000, with the runtime API reference at `/docs`.

On first start the server generates an auth secret into a persistent volume —
`app-state` in production, a separate `dev-state` for the dev backend, because
that container runs as root and a root-owned secret would lock the production
image out. Production writes it as the unprivileged `node` user; if the volume is
not writable the server refuses to start and prints how to hand it over, or set
`AUTH_SECRET` to skip the file. See
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
compose.yml  app + Postgres; compose.dev.yml splits dev in two
docs/        decisions, protocol, search semantics
```

## Origin

Started from Hive Mind, an internal tool built at Alvicom for the same purpose,
rebuilt from scratch as an independent project.
