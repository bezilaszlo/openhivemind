# 0004 — Database test data and isolation

Date: 2026-09-05. Status: accepted.

Integration runs create a throwaway database in the existing compose Postgres
and migrate it before tests; CI uses the same approach with its service. No
testcontainers. Each run owns its database and drops it at teardown. Shared
transaction tests use a small rollback helper; commit-dependent HTTP and
concurrency scenarios reset tables between tests.

Use Drizzle Seed with schema-checked refinements for deterministic fixtures,
not a custom factory framework. Pin stable `drizzle-seed` 0.3.1 as a backend
**development** dependency; it accepts our Drizzle ORM 0.45.2.

Dependency check: npm reports 330,102 downloads for 2026-08-23 through
2026-08-29. The package is maintained in the Drizzle team monorepo, with
prerelease publication as recent as 2026-08-11; the latest commit returned
for the `drizzle-seed` path on the default branch was 2025-05-15. Stable
release activity is slower than the ongoing 1.0 prerelease line, so retain
the compatible stable version and verify it against real Postgres.

Sources: [official usage](https://orm.drizzle.team/docs/seed-overview),
[npm metadata](https://registry.npmjs.org/drizzle-seed),
[download counts](https://api.npmjs.org/downloads/point/2026-08-23:2026-08-29/drizzle-seed),
[source history](https://github.com/drizzle-team/drizzle-orm/commits/main/drizzle-seed).
