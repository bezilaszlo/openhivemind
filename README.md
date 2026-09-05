# Open Hivemind

Shared, searchable history of coding-agent sessions for a team. Self-hosted.

- [VISION.md](VISION.md) — why it exists and what it will never do
- [ROADMAP.md](ROADMAP.md) — what ships when
- [docs/decisions/](docs/decisions/) — why things are the way they are

**Status: design phase.** No runnable code yet.

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

## Layout (planned)

```
backend/     server and API
frontend/    web viewer, client generated from the server's OpenAPI
client/      hook, CLI, harness plugin manifests, agent skills
fixtures/    synthetic transcripts and golden output
deploy/      compose, Dockerfile
docs/        decisions, protocol, search semantics
```

## Origin

Started from Hive Mind, an internal tool built at Alvicom for the same purpose,
rebuilt from scratch as an independent project.
