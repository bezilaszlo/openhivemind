# Frontend design plan

Status: agreed direction; implement alongside the [MVP gates](mvp.md).
Product boundaries follow [VISION](../../VISION.md), the
[stack ADR](../decisions/0002-tech-stack.md) and [privacy rules](../privacy.md).

## Outcome

A developer can find relevant work, read a long coding-agent session comfortably,
and follow its child sessions without losing their place. The interface should
feel calm, precise and fast. Transcript readability and useful information
density take priority over decoration.

Build the session list and a realistic transcript screen first. These establish
the visual language that search, usage and administration reuse. A component
library supplies controls; the rules below supply the product's design.

## Frontend stack

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Application | React + Vite | Existing SPA, served by Fastify |
| Navigation | TanStack Router | Routes, validated URL filters, deep links |
| Server state | TanStack Query | Fetch lifecycle, caching, pagination, mutation invalidation |
| Styling | Tailwind CSS | Layout and styling through shared theme tokens |
| Controls | shadcn/ui | Locally owned buttons, inputs, menus, dialogs, tabs and related primitives |
| Icons | Lucide React | One icon family with consistent size and stroke |
| API | Existing shared-schema fetch wrapper | Endpoint-bound request/response validation; no parallel contract |
| Tests | Vitest + Testing Library | Component behavior and interaction states |

Use one supported shadcn primitive base consistently across installed controls;
record it in the component configuration. Add components as needed. Keep their
source in `frontend/src/components/ui/`; product components live alongside that
directory in `components/`. Apply shared changes there rather than overriding
each instance independently. Review upstream component updates deliberately.

Use `frontend/src/styles.css` for Tailwind setup, theme tokens and transcript
typography. Route modules compose product components and query hooks. Keep local
interaction state in React and remote data in Query; the MVP needs no additional
global state library. Do not combine multiple general-purpose UI kits.

## Visual system

### Colour and surfaces

Start with neutral surfaces and one restrained blue accent. Define semantic
tokens for background, surface, elevated surface, foreground, muted foreground,
border, accent, selection, focus, destructive, success and warning. Use those
tokens throughout; avoid arbitrary per-page colours.

Support light and dark themes from the first two screens, initially following
the system preference with a persisted user override. Both themes must preserve
text contrast and make selection distinct from hover. Status always includes
text or an icon with an accessible name, not colour alone.

Use subtle separators to organize lists and transcripts. Reserve cards for
content that benefits from a boundary, such as a session summary. Avoid putting
every message or metadata field inside its own card. Shadows belong mainly to
overlays; gradients and decorative animation are unnecessary for the MVP.

### Typography and dimensions

Starting values below are shared tokens, adjustable together after reviewing the
reference screens. Do not tune them independently on each route.

| Element | Starting rule |
| --- | --- |
| UI font | System sans-serif stack; no remote font dependency |
| Code and identifiers | System monospace stack |
| Body / transcript | 16 px, approximately 1.6 line height |
| Controls / list text | 14 px, approximately 1.4 line height |
| Secondary metadata | 12–13 px with readable contrast |
| Page title | 24 px, medium or semibold |
| Reading column | Approximately 75 characters wide; code may use the available column width |
| Spacing | 4, 8, 12, 16, 24, 32 and 48 px |
| Corners | 6–8 px for controls and panels; pills reserved for tags |
| Icons | Usually 16 px inside controls, 20 px for navigation |

Use two densities: compact rows for browsing sessions, comfortable spacing for
reading messages. Keep headings restrained and metadata subordinate. Long titles,
remotes and branches must wrap or truncate deliberately without pushing actions
off-screen; their full values remain available in the detail view.

### Interaction

Every shared control defines default, hover, focus-visible, active, disabled and
pending states. Keyboard focus remains visible. Icon-only buttons have accessible
names; essential actions do not depend on hover or a tooltip to be discovered.

Use brief CSS transitions for changes that benefit from continuity. Respect
reduced-motion preferences. Avoid entrance animations on transcript messages.
Use inline feedback for errors and durable outcomes; toasts are supplementary
for transient confirmations such as copying a link.

## Application structure

Desktop shell: compact navigation at the left, page heading and contextual
actions above the content. Primary destinations are Sessions, Search and Usage;
Tokens and organisation settings sit in the settings area. Organisation controls
are shown according to permissions. Do not create an empty dashboard landing page.

On narrow screens, navigation becomes a labelled menu and content uses one
column. Filters wrap or open in a sheet. Session metadata stacks; the transcript
must not cause page-level horizontal scrolling. Code blocks can scroll internally.

Use the URL for query text, committed filters, pagination cursors where appropriate
and session/message deep links. Browser back restores the browsing context. Keep
unsaved form input and open menus local. Do not persist transcript bodies or
credentials to browser storage as a convenience cache.

## Screens and product components

### Sessions

`FilterBar` holds project, branch, author, time range and mine filters supported
by the API. Active filters are visible and removable; provide a clear-all action.

`SessionRow` presents title, project, branch, activity time, harness and a bounded
prompt/reply preview. Secondary details include child-agent information and token
usage when known. Keep one obvious link to open the session, with other actions
as separate controls rather than nested interactive elements.

Distinguish a new installation with no sessions from filters with no matches.
The first points to capture setup; the second offers filter adjustment. Cursor
pagination must not silently fetch all history.

### Session reader

The header shows title, project, branch, harness, model information and timestamps
available from the API. Provide copy-link and, for the owner, delete actions.
Display the current summary in a compact summary card; retain older summaries
at their positions in the feed.

`Message` renders prompts and replies using a consistent reading column and
explicit role labels. A subtle background or edge treatment distinguishes
prompts; replies remain visually quiet. `ToolCall` defaults to a collapsed row
showing tool name and the available scrubbed input. Expanding it never suggests
that omitted tool results or reasoning can be retrieved.

Use a compact `AgentTree` for parent/child navigation, as a side panel when space
permits and a collapsible section on smaller screens. Link children to their own
session pages. Preserve context when returning to the parent.

Provide prompts-only and tool-calls-only views with an obvious way to return to
all messages. A message deep link loads the bounded window around its sequence.
If a filter hides that message, make the situation explicit and offer to clear
the filter. Fetch older/newer windows without losing the visible reading position.
New content must not pull someone away from the message they are reading; offer
a new-messages control instead.

### Transcript rendering

Treat captured text as untrusted content. Render Markdown through a maintained
React renderer with raw HTML disabled and safe URL handling. Never insert server
snippets as unchecked HTML. Render highlights from escaped text or structured
match segments so search cannot introduce executable markup.

Support paragraphs, headings, lists, quotes, links, fenced code and tables.
Do not load remote images automatically: they can contact outside services while
a private transcript is being read. Show a labelled link instead. Bundle required
assets locally.

Code blocks have language labels when available and a copy action that copies
the displayed scrubbed code without line numbers. Plain text is the fallback for
unknown languages. Bound syntax-highlighting work for large blocks; readability
must not depend on successful highlighting. Long URLs wrap, tables scroll within
their container, and code has internal horizontal scrolling.

Continuation messages, unknown usage and missing content are labelled accurately.
Do not show unknown token counts as zero. Do not infer a session is currently
running from a recent timestamp alone.

### Search

Give the query input visual priority. Provide a compact grammar help affordance
and explicit regex/case-sensitive controls following the API contract.
`SearchHit` groups results by session and shows the relevant bounded snippets,
message kind and context needed to judge relevance. Opening a hit goes directly
to that message in the reader.

Distinguish initial, loading, no matches, invalid query and timeout states. Keep
the query editable after errors. A timeout offers narrower filters and never
looks like a successful empty search. Show when displayed results belong to a
previous query during refresh; do not present stale results as current matches.

### Usage, tokens and organisation

Usage starts with clear totals and a time range, using the dimensions supported
by the API. Add charts only when they improve a concrete comparison; always
include readable values and unknown-data states. No per-person counts, rankings
or activity timelines.

Tokens: names, scopes and lifecycle actions. Show a newly minted secret once
with a copy control; keep it out of URLs, analytics and persisted caches. Revoking
a token has a clear pending state and result.

Organisation: simple member rows, role controls and invite creation. Copyable
invite links are treated as secrets. Form errors stay next to their fields and
preserve valid input. Access-denied and expired-invite states explain the next
available action without exposing internal implementation details.

Owner-only deletion uses an alert dialog naming the session and explaining that
descendants are included. Wait for server confirmation before removing the view;
on failure keep the context and show the error. Do not offer an undo that the
purge contract cannot support. Refresh affected session and search queries after
success. Permission checks in the UI complement server authorization.

## Consistency, accessibility and performance

Use semantic headings, links, buttons and labelled form fields. Preserve the
focus management supplied by the control primitives, including returning focus
when dialogs close. Validate keyboard operation and text contrast in both themes;
component defaults alone do not establish accessibility for a composed screen.

Loading placeholders reserve realistic space. Recoverable failures have a retry
action. Preserve loaded content during background refresh where appropriate and
clearly mark refresh failures. Session expiry takes the user to login while
preserving a safe in-app return destination.

Start with bounded server pagination and rendering. Add virtualization only if
measured transcript workloads need it; it must preserve deep links, keyboard
navigation, text selection and reading position. Avoid unbounded DOM growth,
eager highlighting of whole sessions and loading all icon or language definitions.

## Delivery and acceptance

1. **Foundation, Gates 1–2:** configure Tailwind, shadcn and Lucide; define tokens,
   shared controls and the shell. Document the chosen primitive base. Establish
   fixture-backed component states without introducing another API schema.
2. **Reference screens, Gate 3:** implement the session list and reader against
   realistic fixture content, then connect the vertical slice. Review light/dark
   themes, narrow/desktop widths, long content, empty, loading and error states.
   These screens become the reference for later work.
3. **Features, Gate 4:** implement search, child navigation, usage, tokens, invites
   and owner deletion using the established components. Extend tokens and shared
   variants centrally when a real need appears.
4. **Polish, Gate 5:** perform manual visual and keyboard review against the built
   app during the acceptance run. Record any remaining limitations with the MVP
   validation results.

Vitest and Testing Library cover meaningful behavior: filters and query states,
safe transcript rendering, collapsed tool calls, unknown usage, form failures,
permission-dependent actions and deletion confirmation. Avoid snapshots that only
freeze implementation markup. Browser e2e and Playwright are intentionally outside
the MVP plan.

The frontend is ready when the reference screens and feature screens share the
same controls and tokens, realistic transcripts remain readable without layout
overflow, all specified states have useful feedback, keyboard navigation works,
and the two-laptop acceptance flow succeeds. Good design here includes complete
behavior as well as appearance.

## Library references

- [shadcn/ui](https://ui.shadcn.com/docs): component source and composition.
- [Tailwind theme variables](https://tailwindcss.com/docs/theme): shared styling tokens.
- [Lucide](https://lucide.dev/guide/): icons and consistent sizing.
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction): optional
  measured optimization for long content, not a foundation dependency.
