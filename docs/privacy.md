# Privacy rules

These are the rules the client and server are built to. VISION.md states the
principles; this file is the checklist tests are written against.

## What leaves the laptop

Per session: project key (normalised remote), branch history, cwd, title
(the harness's native title when available, otherwise the first prompt),
harness and version, models, token usage. Per message: kind
(prompt, reply, tool_call, summary), text, timestamp, model, usage.

Tool calls are sent as the tool name plus the first 200 characters of the
scrubbed input. Subagent sessions are sent the same way as child sessions.

## What never leaves the laptop

- Tool results (file contents, command output, fetched pages).
- Thinking / reasoning blocks.
- Harness bookkeeping lines (attachments, file history, queue state, …).
- Anything matching the scrub rules below.
- Tool calls whose input mentions credential material or paths:
  `env`, `printenv`, `.env`, `secret`, `token`, `password`, `credentials`,
  `gh auth`, `.pem`, `.key`, `.netrc`, `.npmrc`, `kubeconfig`, `.aws/`,
  `.ssh/`. These are sent as `<tool> [redacted]`.

## Scrub

Runs on the laptop, on the full text of every field that is sent, before any
truncation. Order: redact tool calls by rule above, then regex scrub, then
truncate for display.

Fields scrubbed: message text, tool input, title, cwd, branch names, the
remote (userinfo is stripped by normalisation and the result is scrubbed
again), summary text, and every string in the payload that is not an enum or
an id we generated.

Patterns: `scrub_patterns.json`, derived from gitleaks' default rules (MIT,
attribution kept in the file): cloud provider keys, `sk-` style API keys,
GitHub/GitLab/Slack/Google tokens, JWTs, PEM blocks, `password|secret|token|
api[_-]?key = …` assignments, basic-auth URLs, our own `ohm_` tokens, and
high-entropy strings of 32+ characters mixing character classes. UUIDs and hex
digests are exempt, and so are paths, URLs and package names — but recognised
structurally, not by containing a `/` or a `.`: a token is treated as a path
only when none of its runs of letters and digits is itself 32+ characters of
secret-looking material. A path is words held apart by separators, while a
secret keeps its one long random run whatever punctuation is appended to it, so
`<secret>.x` and `<secret>/x` are still redacted. CamelCase runs that are really
words — a fully qualified Java name, a long React filename — are kept. Replacement
is `[REDACTED:<kind>]`.

Known limits of the entropy fallback, measured 2026-09-06; it is a backstop
behind the named patterns above, not the first line of defence:

- A run of a single letter case plus digits stays exempt at any length, because
  the rule needs three character classes. Base32-style secrets fall in this gap.
- A secret drawn from an alphabet that contains its own separators (`+`, `/`,
  `-`, `_`, as base64 and base64url do) is broken into runs shorter than 32 by
  its own characters, so appending `.x` to one still hides it about half the
  time. Alphanumeric secrets of 32+ characters are caught 99.6% of the time in
  the same test.

Extra patterns: `.openhivemind-ignore` at the repo root and
`~/.config/openhivemind/ignore`, one regex per line. A file with an invalid
pattern fails closed: nothing is uploaded from that repo until it is fixed, the
hook still exits 0, and `doctor` names the line.

Regression: `fixtures/scrub/` contains one document per pattern; the test
asserts none survives, in text and in every metadata field.

## Local state

`~/.local/state/openhivemind/` (cursors, spool, lock, `hook.log`) and
`~/.config/openhivemind/config.json` (server, token) are created mode 700/600.
`hook.log` records timestamps, session ids, byte counts and error classes,
never transcript text, payloads or tokens. Spool chunks are already scrubbed
when written.

## Server

- Author is always the PAT's user; the payload carries no identity.
- Every read is scoped to the caller's organisation; there is no cross-org
  path, including id-prefix resolution.
- Purge is owner-only. It deletes the session and its descendants and leaves a
  tombstone so a delayed retry cannot resurrect it.
- Retention (default 90 days, configurable) deletes by activity age, not
  receipt time, so re-beaming old history does not extend it. Backups follow
  the same expiry.
- No per-person analytics: no counts of sessions or hours per author, no
  activity timelines per person, no export of author metadata. Author is a
  filter on search and list only.
- Logs never contain message text.

## Controls a developer has

- Folders: `roots` and `exclude` lists in `~/.config/openhivemind/config.json`,
  set by `setup --root <dir>` / `--exclude <dir>`. Empty `roots` means every
  git checkout; otherwise only checkouts under a listed directory. `exclude`
  wins over `roots`. Both are compared on resolved real paths, so symlinks and
  worktrees cannot leak around them. `doctor` prints the effective lists. This
  is the only on/off switch; no environment variable.
- Per repo: no `origin` remote means no capture.
- Per pattern: the ignore files above.
- After the fact: `openhivemind purge <id>` or the delete button on any own
  session in the viewer. Descendants go with it; a tombstone stops late
  retries.
- Inspection: `openhivemind hook --dry-run < event.json` prints exactly what
  would be sent.
