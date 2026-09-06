# Changelog

## Unreleased

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

Validation: 46 unit/component/contract tests pass; the latest backend integration
run passed 13 tests. The frontend production build passes. Browser visual review
was unavailable because no browser was connected.

This checkpoint does not implement the full MVP. Packaged CLI capture commands,
native plugin assembly, complete retention/metrics, frontend acceptance and
multi-laptop/load acceptance remain open. No release is ready for publication.
