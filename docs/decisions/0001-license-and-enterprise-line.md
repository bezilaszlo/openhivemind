# 0001 — License and the enterprise line

Date: 2026-09-05. Status: accepted.

## License

MIT for the whole repo. No CLA, no DCO for now. Revisit on the first outside PR
(a CLA is what keeps relicensing possible; DCO only records provenance).

## Monetization

Out of scope for this repo. Self-hosting and small-team adoption come first.
If a paid tier ever exists it lives in a separate product or an `ee/` tree, not
in the free path.

## Enterprise lever: identity governance, not the login method

Market check (2026-09): Langfuse, Arize Phoenix, Agenta and Opik ship local
auth free and gate SSO behind a paid tier. That is the classic enterprise
conversion point, but gating the login method itself draws the sso.tax label
("SSO wall of shame") and blocks exactly the security-conscious small teams we
want to adopt the tool.

Decision: keep the lever, move the line to governance.

Free, self-host:
- local auth (email/password, invites)
- OIDC login against any IdP (Keycloak, Cognito, Entra, Okta, GitHub); user
  created on first login
- personal access tokens for hooks/CLI

Enterprise (future, `ee/` or separate product):
- SSO enforcement (disable local passwords)
- SCIM provisioning and deprovisioning
- IdP group → role/project mapping
- SAML
- audit log (views, searches, purges, token mints, settings changes)
- session policies (lifetime, forced re-auth, IP allowlists)
- extended retention / legal hold

Consequence for the code: one auth provider interface with local + OIDC in the
free tree. Each gated item is a separate module that plugs in around it
(enforcement flag, SCIM endpoint, group mapper, SAML provider, audit
middleware) so it can move to `ee/` without touching the free path.
