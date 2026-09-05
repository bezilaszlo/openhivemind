# Changelog

## Unreleased

Initial MVP foundation checkpoint: pnpm workspace on Node 24 LTS, shared wire
schemas and API validation, project normalization, privacy and parser regression
tests, Boolean search grammar, runtime OpenAPI, generated auth schema and initial
Fastify local-auth bridge. Integration runs create and remove their own database;
the packed CLI currently exposes help, version, config and bundled skills.

This checkpoint does not implement the full MVP. Capture/upload, session data
services, OIDC acceptance, the functional viewer and multi-laptop/load acceptance
remain open. No release is ready for publication.
