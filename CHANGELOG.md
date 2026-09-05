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

Validation: 46 unit/component/contract tests pass; the latest backend integration
run passed 13 tests. The frontend production build passes. Browser visual review
was unavailable because no browser was connected.

This checkpoint does not implement the full MVP. Packaged CLI capture commands,
native plugin assembly, complete retention/metrics, frontend acceptance and
multi-laptop/load acceptance remain open. No release is ready for publication.
