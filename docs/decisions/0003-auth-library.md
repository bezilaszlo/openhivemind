# 0003 — Auth library: Better Auth, pinned, with explicit switches

Date: 2026-09-05. Status: accepted. Supersedes the "candidate" wording in ADR 0002.

## Context

The server needs local email/password with invite links, generic OIDC login
keyed by issuer + subject with no email auto-linking, organisations with
admin|member roles where the first user creates the org, DB-backed cookie
sessions with CSRF, rate limiting on credential endpoints, and a schema we own
through Drizzle migrations. Our own PAT table stays outside the library.

Spike on 2026-09-05 against Better Auth v1.7.2 (MIT, ~30k stars, weekly
releases, acquired by Vercel 2026-07-07 with MIT and community model stated to
continue). Fallback evaluated: hand-rolled local auth + `openid-client` v6.

## Decision

Adopt Better Auth for local auth, OIDC (generic-oauth plugin), organisations
(organization plugin), sessions, CSRF and rate limiting. Keep PATs, ingest
authorization and the "first user creates the org" bootstrap as our own code.

## Caveats, each a task in Gate 2

1. **Pin the exact version.** v1.7.0 reworked the account identity model with
   a data migration. Every upgrade: bump, `@better-auth/cli generate`,
   `drizzle-kit generate`, review the diff, run the integration lane.
2. **Fastify shim is ours.** No official adapter; a catch-all route bridging
   Fetch Request/Response, `trustedOrigins`, trust-proxy headers, and no
   double body parsing. Tested behind a reverse proxy in the integration lane.
3. **Set `accountLinking.enabled: false`** (email auto-link is on by default)
   and the `issuer` identity strategy so identities are keyed by issuer +
   subject.
4. **Invites are ours, not the plugin's.** Verified on v1.7.2: the plugin
   requires an email per invitation, uses the plain row id as the token and
   rejects accept unless the session email equals the invite email. That
   forbids the copyable open link. Own `invite` table (hashed token, optional
   email) and own accept endpoint that creates the member row through the
   library adapter. SMTP later, same link.
5. **Two roles.** `creatorRole: "admin"` plus a custom `createAccessControl`
   set with only `admin|member`; `owner` never exists. Role is a plain text
   column, so the API layer validates the value.
6. **First-user bootstrap** is a transaction of ours guarded by a unique
   constraint; concurrent first registrations cannot create two orgs.
7. **Rate limiter storage** is DB-backed from day one so a second instance
   does not weaken it.
8. **`disableCSRFCheck` is global.** No route may ever need it; external
   callers stay outside the auth mount.
9. **Schema lives in our Drizzle tree**, generated then owned; auth tables in
   Postgres schema `auth` (adapter `schemaName`). Names are kept as generated
   so upgrade diffs stay readable. The library never validates the live DB;
   its config is the runtime source of truth, so config and schema change
   together in one commit.
11. **Build the CLI from the pinned source.** `@better-auth/cli@latest` on npm
    lagged at 1.4.21 while the library was 1.7.2 and generated the pre-1.7
    account model without `issuer`. Generation runs from the monorepo tag
    matching the pinned version, or a pinned CLI version once one matches.
12. **Email is required** on user and on OIDC sign-in (`EMAIL_NOT_FOUND`);
    issuer+subject keying exists, nullable email is deferred to their v2.
    Providers that withhold email are unsupported in MVP; documented in
    `self-host.md`.
10. **Watch the roadmap.** If generic self-hosted OIDC/org support degrades,
    the exit is hand-rolled local auth + `openid-client` v6 behind the same
    provider interface; ~2–3x the wiring effort, small dependency chain.

Known wart: `better-auth` transitively installs the `mongodb` driver through
its Mongo adapter. Cosmetic; noted so nobody reads it as a requirement.
