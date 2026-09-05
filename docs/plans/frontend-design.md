# Frontend design

Direction for the viewer. Gates and scope: [mvp.md](mvp.md). Boundaries:
[VISION](../../VISION.md), [ADR 0002](../decisions/0002-tech-stack.md),
[privacy](../privacy.md).

## Outcome

Find relevant work, read a long agent session comfortably, follow its child
sessions without losing your place. Calm, dense, fast. Transcript readability
over decoration.

Build the session list and the session reader first, against fixture
transcripts. They set the visual language; search, usage and admin reuse it.

## Stack additions

On top of React, Vite, TanStack Router and Query and the shared-schema fetch
wrapper from ADR 0002:

| Layer | Choice |
| --- | --- |
| Styling | Tailwind CSS, theme tokens in `frontend/src/styles.css` |
| Controls | shadcn/ui, copied into `frontend/src/components/ui/`, one primitive base |
| Icons | Lucide |
| Markdown | a maintained React renderer, raw HTML off, safe URLs |
| Tests | Vitest + Testing Library; no browser e2e in the MVP |

No second UI kit, no global state library, no remote fonts.

The primitive base is **Radix UI**, through the unified `radix-ui` package;
`cn` is `clsx` + `tailwind-merge`. Copied so far: button, badge, input, label,
select, alert-dialog and sheet. They are our source: wired to the tokens
below instead of shadcn's default palette, with the entrance animations
dropped, and only added when a screen uses them.

Files: `main.tsx` holds the routes and bootstrap only; one screen per file in
`frontend/src/screens/`; shared product components in
`frontend/src/components/`, primitives in `frontend/src/components/ui/`;
formatting, harness metadata, theme and `cn` in `frontend/src/lib/`. Keep
files under about 400 lines.

## Visual rules

- Neutral warm surfaces, one teal accent, semantic tokens only (background,
  surface, foreground, muted, border, accent, selection, focus, destructive,
  success, warning). Light and dark from day one, system preference with a
  persisted override. Status never by colour alone.
- Separators, not cards, for lists and messages. A card only for the session
  summary. No gradients, no entrance animation; respect reduced motion.
- System sans for UI, system mono for code. Transcript 16 px / 1.6, list rows
  14 px / 1.4, metadata 12–13 px. Reading column about 75 characters; code may
  use the full width with internal horizontal scroll. Spacing scale 4–48 px,
  6–8 px corners.
- Harness identity: each source borrows its own hue, tuned to sit on the warm
  ground next to the teal accent and to reach 4.5:1 on its own background.

  | Harness | Light | Dark |
  | --- | --- | --- |
  | Claude Code | `#9C4A2B` | `#D97757` |
  | Codex | `#4A6E5D` | `#74AC90` |
  | opencode | `#6A5AA5` | `#9E85D8` |

  A row or message sets `data-harness`, which resolves the `--harness` token;
  tints are the same token at 8% over its surface, so one token per harness
  per theme covers stripe, badge, tint and chip. It shows only in the session
  row (left stripe plus a badge with glyph and name), the reader header badge,
  the prompt background tint, the tool-call chips and the child stripes in the
  agent tree. Replies stay neutral; nothing else takes a
  harness colour. Each harness also has its own 16 px geometric glyph in
  `currentColor` — ours, not a vendor logo — so the source never depends on
  colour alone. A harness glyph is the vendor's own mark only where its licence
  allows it — today opencode's; Anthropic and OpenAI both require written
  permission, so Claude Code and Codex keep geometric stand-ins. Sources,
  licences and the guideline pages are recorded in `assets/README.md`. An
  unknown source falls back to the muted token.
- Two densities: compact rows for browsing, comfortable for reading.
- Every shared control has hover, focus-visible, active, disabled and pending
  states. Icon-only buttons have names. Nothing essential hides behind hover.
- URL holds query, filters, cursor and session/message deep links. Browser
  back restores context. No transcript text or credentials in browser storage.

## Brand

Assets in `frontend/public/` (`mark.svg`, `logo.svg`, `favicon.svg`) and
`assets/` (banner); geometry and licence in `assets/README.md`.

- Mark: the dotted disc, `currentColor`, so it takes the foreground token.
  Sidebar and login use `logo.svg` (mark + `openhivemind` wordmark); the
  browser tab uses `favicon.svg`. Never recolour, outline or animate it.
- Wordmark: lowercase `openhivemind`, system sans, weight 600, slightly tight
  tracking. Product name in prose stays "Open Hivemind".
- Tokens: background `#FAF8F5` light / `#14161A` dark; accent `#3A8291`.
  The accent is about 4.1:1 on both grounds: fine for the mark, buttons, links
  and focus rings, not for body text. Small accent-coloured text and solid
  accent fills use a per-theme tint that reaches 4.5:1: `#2F7487` on light,
  `#5AA5B4` on dark.
- Voice: eyebrow "Many minds, one memory." and tagline "One memory. Every
  session." are the only slogans; login page shows the lockup and the tagline,
  nothing else decorative.

## Shell

Left navigation: Sessions, Search, Usage; Tokens and Organisation under
settings, shown by permission. Login stands alone, without the shell. No
dashboard landing page. Narrow screens: one column, navigation and the reader's
agent panel as sheets, filter bars wrapping into the column, never page-level
horizontal scroll.

## Screens

**Sessions.** Filter bar for project, branch, author, time range, mine;
active filters visible and removable. Row: title, project, branch, activity
time, harness, bounded last prompt/reply, child count and tokens when known.
One link opens the session; other actions are separate controls. Empty
install ("set up capture") differs from no matches ("adjust filters").
Cursor pagination, never fetch everything.

Activity is a property of a row, never of a person: no presence list, no
member recency, no per-author activity anywhere in the product. A session
counts as active while `completed` is false and its last activity is within
ten minutes; the row then shows a small pulsing dot in the harness hue and
"active 2 min ago", static under reduced motion. After ten minutes the dot
goes and the row shows the plain relative time; a completed session reads
"ended". Never "running" or "live": capture can stop without the session
ever being marked complete. The list polls the changes feed with its stored
cursor every 30 seconds while the tab is visible and invalidates only the
sessions that feed names.

Subagents get a cell of their own, because a session that opened subagents
which opened their own is usually waste, and a subagent that silently inherits
a top-tier model drains a quota. The signal is structural, never a warning
colour: the session's model chip, then one chip per child model with its count
("opus-5 ×7 ~1"), dotted when every child inherited the session model and
carrying a "~N" suffix when only some did, then a plain "N deep" marker when
the rollup's `maxDepth` reaches 2. Hovering or focusing the cell opens the
tree, grouped by depth, each child linking to its own page. Row tokens are the
whole tree; the session's own number stays in the title. Filters "With
subagents", "Nested" and "Inherited model" sit beside "Only mine".

**Reader.** Header: title, project, branch, harness, models, timestamps,
copy link, delete for the owner. Current summary as a compact card; older
summaries stay in place in the feed. Prompts get a subtle background, replies
stay quiet, tool calls collapse to name plus scrubbed input and never imply
the result exists. Agent tree as a side panel, collapsible when narrow;
children open as their own pages, returning keeps the parent's position.
Prompts-only and tool-calls-only toggles. A deep link loads the window around
that seq; if a toggle hides it, say so and offer to clear. Loading older or
newer windows keeps the reading position. The header carries the same
activity indicator as the row, and the changes poll only enables a "new
messages" control: nothing loads or scrolls until the reader asks. The agent
panel repeats the rollup chips and the depth marker beside "Subagents (N)" and
lists the children grouped by depth with ↳ indentation; a child page says
"Subagent session, depth N" under its title and links back to the root.

**Transcript rendering.** Captured text is untrusted. Markdown through the
renderer above; snippets and highlights from escaped text or structured
match segments, never raw HTML. Paragraphs, headings, lists, quotes, links,
fenced code, tables. Remote images are not loaded, a labelled link replaces
them. Code blocks: language label, copy action, plain text fallback, bounded
highlighting. Continuation messages and unknown usage are labelled; unknown
tokens are never shown as zero; a recent timestamp does not mean "running".

**Search.** Query input first, grammar help affordance, regex and
case-sensitive controls per the API. Hits grouped by session with bounded
snippets and message kind; opening a hit lands on that message. Distinct
states: initial, loading, no matches, invalid query, timeout. Timeout offers
narrower filters and never looks like an empty result. Stale results are
marked while a new query runs.

**Usage.** Totals and a time range over the API's dimensions. Charts only
when they help a comparison, with readable values. No per-person counts,
rankings or timelines.

**Tokens and organisation.** Token name, scopes, revoke with pending state;
the minted secret shown once with copy, never in a URL or cache. Members,
roles, invites; invite links treated as secrets. Errors next to their fields.

**Delete.** Owner only. Alert dialog naming the session and stating that
descendants go with it. Remove from view only after the server confirms; no
undo, the purge contract has none. Invalidate session and search queries.

## Quality bar

Semantic headings, links, buttons, labelled fields; focus returns when
dialogs close; keyboard and contrast checked in both themes. Loading
placeholders reserve space; failures have retry; session expiry returns to
login with a safe return path. Bounded pagination and rendering first;
virtualization only if measured, and only if it keeps deep links, keyboard
navigation, selection and reading position.

Tests cover behaviour: filters and query states, safe rendering, collapsed
tool calls, unknown usage, form failures, permission-dependent actions,
delete confirmation. No markup snapshots.

## Delivery

1. Gates 1–2: Tailwind, shadcn, Lucide, tokens, shell, shared controls,
   fixture-backed component states.
2. Gate 3: sessions list and reader against fixtures, then the live slice.
   Review both themes, both widths, long content, empty/loading/error.
3. Gate 4: search, agent tree, usage, tokens, invites, delete.
4. Gate 5: manual visual and keyboard review in the acceptance run.

Done when all screens share the same controls and tokens, realistic
transcripts read without overflow, every listed state has feedback, keyboard
works, and the two-laptop run passes.
