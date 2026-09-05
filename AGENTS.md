# Repository guide

Read README.md and docs/plans/mvp.md before changing implementation. The contracts
are in docs/protocol.md, privacy policy in docs/privacy.md and search semantics in
docs/search.md. ADRs in docs/decisions/ own stack choices.

Four pnpm packages: shared (pure schemas, parsers, privacy and search), backend
(Fastify/Postgres), frontend (React viewer), client (capture and CLI). Apps only
depend on shared, never on another app. Runtime state stays outside this repo.

Use Node from .nvmrc and the packageManager-pinned pnpm. Run pnpm install,
pnpm check, pnpm build; pnpm test:integration creates and drops its own database on local compose
Postgres; DATABASE_URL selects a different Postgres server. pnpm test:pack checks an installed local tarball, never npx.

Keep related code together; a file is fine until roughly 800 lines, then consider splitting.
Keep code lean. Delete replaced paths; compatibility needs a named external
contract. TypeBox schemas are the single wire contract; validate unknown data.
Tests assert behavior, including privacy and tenant boundaries. Unit tests live
beside modules; acceptance tests live in package test directories. Suppressions
must be targeted and justified. Gates and lint rules: docs/decisions/0004-quality-gates.md. Never log secrets or transcript contents.

Update relevant docs with user-visible behavior. Use Conventional Commits; no
agent attribution trailers. Verify author, committer and GitHub writer identity
before commits or writes. Personal repository writes use kalcifield. Push only
when asked. Preserve unrelated edits and user-managed branches.
