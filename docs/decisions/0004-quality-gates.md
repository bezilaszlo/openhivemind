# 0004 — Quality gates

Date: 2026-09-05. Status: accepted; ruleset applied once the MVP code paths
land (deliberately not mid-build, so agents' pre-commit hooks stay green).

## Context

The scaffold runs oxlint with default rules, oxfmt, `tsc --noEmit` and Vitest
through lefthook and CI. Defaults let through 170-line functions, nested
ternaries, non-null assertions and comma-chained declarations; nothing checks
promise handling or the "apps depend only on `shared`" rule. Model: the
oxlint configuration in the openclaw repository, scaled down.

## Decision

**Where gates run.** Pre-commit (lefthook): typecheck, lint, format check and
unit tests on staged packages, under ten seconds. CI: the same on everything,
plus integration on a throwaway database, pack, and `pnpm audit`. Anything
slower never enters the hook.

**Type checking.** TypeScript 7 native (tsgo) is the compiler. Type-aware
lint via `oxlint-tsgolint` and `oxlint --type-aware`, pinned to the same tsgo
line as `typescript`. Floating and misused promises, unsafe template
expressions, unbound methods and non-exhaustive switches are errors.

**Lint ruleset** (`.oxlintrc.json`, warnings denied): plugins unicorn,
typescript, oxc, import, promise, vitest; categories correctness, perf and
suspicious as errors; limits complexity 15, function length 80, depth 4,
params 5, file length 400 (tests 800), no nested ternaries, `one-var`
never, `no-non-null-assertion` (tests exempt), `curly` always. Changing a
rule is a commit that says why; suppressions are line-level with a reason.

**Architecture boundary.** `backend`, `frontend` and `client` import only
`@openhivemind/shared` and third parties, never each other; `shared` imports
no app and no Node I/O. Enforced by `import/no-restricted-paths` in the same
config, so a violation fails the build rather than a review.

**Format.** oxfmt, print width 100, sorted imports, trailing commas; Markdown
under `docs/` excluded.

**Tests.** Behaviour, not markup: no snapshot files. Unit tests beside the
module, integration and acceptance in package `test/`. No coverage
percentage gate; a missing test for a behaviour is a review finding.

## Consequences

- One hardening commit after the client and viewer paths land: add the
  config and `oxlint-tsgolint`, run `oxlint --fix`, fix the rest by hand.
- Agents and people get the same mechanical verdict; review time goes to
  behaviour and design.
- Node runtime is provisioned by pnpm `devEngines.runtime` from `.nvmrc`;
  CI and laptops run the same version.
