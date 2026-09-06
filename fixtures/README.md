# Capture fixtures

These are structurally preserved captures from the isolated discovery runs of
2026-09-05: Claude Code 2.1.259, Codex CLI 0.153.4 and opencode 1.18.29.
Every free-form string was replaced with fixture text, ids remapped, paths and
remotes replaced. Numerical usage and record/block structure are retained.
Raw captures are never committed. opencode's fixture is an ordered JSON export
of message/part rows from the discovery SQLite database, not an SDK simulation.

`codex/rollouts/` holds three synthetic rollout files in Codex's on-disk layout
(`rollout-<timestamp>-<threadId>.jsonl`): a parent, a child whose
`session_meta.session_id` is that parent, and an unrelated thread, for the
adapter's discovery, title and filename-fallback tests. The `content_item_kinds`
of the user messages in `codex/session.json` were reconstructed (not recovered)
after the 2026-09-06 re-verification: the original scrub replaced that closed
enum as if it were free-form text, which hid which block the developer typed.
The values follow the block structure Codex 0.153.4 writes for the same message
shapes; the two-block opening user message is the AGENTS.md and environment
context pair, the single-block ones after a `turn_context` are `user.text`.

`claude-code/subagents/` holds a synthetic flat subagent folder in the on-disk
layout Claude Code uses (`agent-<id>.jsonl` plus `agent-<id>.meta.json`), with a
depth-1 and a depth-2 child, for the discovery and child-capture tests.

`claude-code/session.json` opens with a synthetic `/clear`: an `isMeta: true`
`local-command-caveat` record, an `isMeta: true` `/clear` command echo, and the
`system`/`local_command` stdout record Claude Code emits alongside them — none
of which reach the golden. The first real prompt record carries a trailing
`system-reminder` on the same block as the typed text, added by hand (not
recovered) to lock in that a reminder is stripped wherever it sits in the
block, not just at a bare leading position.

The goldens describe normalized output from these captures. Synthetic edge cases
in parser tests supplement the real captures for compaction, secret-bearing tool
calls, duplicate response usage and future/unknown record types. The captures do
not yet cover every declared harness capability; Gate 1 remains open until that
coverage and the FTS comparison are recorded.
