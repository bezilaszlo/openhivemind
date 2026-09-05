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
// Geometric marks of our own: a filled wedge, a terminal caret, a nested rhombus.
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
const OpencodeGlyph: Glyph = ({ className }) => (
  <svg {...svg} className={className}>
    <path d="M8 2.6 13.4 8 8 13.4 2.6 8Z" />
    <path d="M8 6.2 9.8 8 8 9.8 6.2 8Z" />
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
