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

No second UI kit, no global state library, no remote fonts. Product
components live in `frontend/src/components/`, routes compose them.

## Visual rules

- Neutral surfaces, one blue accent, semantic tokens only (background,
  surface, foreground, muted, border, accent, selection, focus, destructive,
  success, warning). Light and dark from day one, system preference with a
  persisted override. Status never by colour alone.
- Separators, not cards, for lists and messages. A card only for the session
  summary. No gradients, no entrance animation; respect reduced motion.
- System sans for UI, system mono for code. Transcript 16 px / 1.6, list rows
  14 px / 1.4, metadata 12–13 px. Reading column about 75 characters; code may
  use the full width with internal horizontal scroll. Spacing scale 4–48 px,
  6–8 px corners.
- Two densities: compact rows for browsing, comfortable for reading.
- Every shared control has hover, focus-visible, active, disabled and pending
  states. Icon-only buttons have names. Nothing essential hides behind hover.
- URL holds query, filters, cursor and session/message deep links. Browser
  back restores context. No transcript text or credentials in browser storage.

## Shell

Left navigation: Sessions, Search, Usage; Tokens and Organisation under
settings, shown by permission. No dashboard landing page. Narrow screens:
one column, navigation as a menu, filters in a sheet, never page-level
horizontal scroll.

## Screens

**Sessions.** Filter bar for project, branch, author, time range, mine;
active filters visible and removable. Row: title, project, branch, activity
time, harness, bounded last prompt/reply, child count and tokens when known.
One link opens the session; other actions are separate controls. Empty
install ("set up capture") differs from no matches ("adjust filters").
Cursor pagination, never fetch everything.

**Reader.** Header: title, project, branch, harness, models, timestamps,
copy link, delete for the owner. Current summary as a compact card; older
summaries stay in place in the feed. Prompts get a subtle background, replies
stay quiet, tool calls collapse to name plus scrubbed input and never imply
the result exists. Agent tree as a side panel, collapsible when narrow;
children open as their own pages, returning keeps the parent's position.
Prompts-only and tool-calls-only toggles. A deep link loads the window around
that seq; if a toggle hides it, say so and offer to clear. Loading older or
newer windows keeps the reading position; new content shows a control, never
scrolls the reader.

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
