import type { Session } from "@openhivemind/shared";
export type Harness = Session["source"];
type Glyph = (props: { className?: string }) => React.ReactElement;
const svg = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  "aria-hidden": true,
};
// Anthropic and OpenAI both require written permission for logo use, so Claude Code
// and Codex get geometric marks of our own: a filled wedge and a terminal caret.
// opencode's licence allows its own mark, so that one is the real thing.
// Distinct silhouettes so the harness reads without relying on colour.
const ClaudeCodeGlyph: Glyph = ({ className }) => (
  <svg {...svg} className={className} fill="currentColor">
    <path d="M8 2.4 14 13.2H2Z" />
  </svg>
);
const CodexGlyph: Glyph = ({ className }) => (
  <svg {...svg} className={className}>
    <path d="M3.4 4.6 6.8 8l-3.4 3.4" />
    <path d="M8.8 11.6h3.8" />
  </svg>
);
// opencode's own mark, taken verbatim from the project's favicon; the viewBox is
// cropped to the mark so it sits at the same optical size as the others.
const OpencodeGlyph: Glyph = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="128 96 256 320"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
    />
  </svg>
);
export const harnesses: Record<Harness, { label: string; Glyph: Glyph }> = {
  "claude-code": { label: "Claude Code", Glyph: ClaudeCodeGlyph },
  codex: { label: "Codex", Glyph: CodexGlyph },
  opencode: { label: "opencode", Glyph: OpencodeGlyph },
};
const UnknownGlyph: Glyph = ({ className }) => (
  <svg {...svg} className={className}>
    <circle cx="8" cy="8" r="5" />
  </svg>
);
export const isHarness = (source: string): source is Harness => source in harnesses;
export const harness = (source: string) =>
  isHarness(source) ? harnesses[source] : { label: source, Glyph: UnknownGlyph };
