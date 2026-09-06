# Repository guide

Read README.md and docs/plans/mvp.md before changing implementation. Contracts:
docs/protocol.md; privacy: docs/privacy.md; search: docs/search.md. ADRs in
docs/decisions/ own stack choices; quality gates: docs/decisions/0004.

Four pnpm packages: shared (pure schemas, parsers, privacy, search; no I/O side
effects), backend (Fastify/Postgres), frontend (React viewer), client (capture,
CLI; client/plugins/, client/skills/ hold integrations). Apps depend on shared,
never each other. fixtures/ holds sanitized captures and goldens; assets/ and
frontend/public/ hold visual assets. Runtime state stays outside this repo, no
.env loading, config is explicit. Never log secrets or transcript contents.

Use Node from .nvmrc and the packageManager-pinned pnpm. pnpm install provisions
the pinned runtime. pnpm dev:stack: containerized stack, hot reload, migrations.
pnpm dev: backend/viewer on host (configure Postgres, migrate per README first).
Run pnpm check, pnpm build. pnpm test:integration creates/drops its own database
on local compose Postgres, never a developer's own; DATABASE_URL picks another
server. pnpm test:pack checks an installed local tarball, never npx.

Keep related code together; split around 800 lines. TypeBox schemas are the
single wire contract; validate unknown data. Vitest and Testing Library: unit
tests live beside modules, acceptance tests live in package test directories.
Tests assert behavior, especially privacy and tenant-boundary isolation.
