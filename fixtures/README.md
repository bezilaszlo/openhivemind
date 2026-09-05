# Capture fixtures

These are structurally preserved captures from the isolated discovery runs of
2026-09-05: Claude Code 2.1.259, Codex CLI 0.153.4 and opencode 1.18.29.
Every free-form string was replaced with fixture text, ids remapped, paths and
remotes replaced. Numerical usage and record/block structure are retained.
Raw captures are never committed. opencode's fixture is an ordered JSON export
of message/part rows from the discovery SQLite database, not an SDK simulation.

`claude-code/subagents/` holds a synthetic flat subagent folder in the on-disk
layout Claude Code uses (`agent-<id>.jsonl` plus `agent-<id>.meta.json`), with a
depth-1 and a depth-2 child, for the discovery and child-capture tests.

The goldens describe normalized output from these captures. Synthetic edge cases
in parser tests supplement the real captures for compaction, secret-bearing tool
calls, duplicate response usage and future/unknown record types. The captures do
not yet cover every declared harness capability; Gate 1 remains open until that
coverage and the FTS comparison are recorded.
