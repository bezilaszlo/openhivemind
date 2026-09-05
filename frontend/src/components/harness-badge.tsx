import { harness, isHarness } from "../lib/harness";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
/** Marks an element with the harness hue. Unknown harnesses fall back to the muted token. */
export const harnessProps = (source: string) =>
  isHarness(source) ? ({ "data-harness": source } as const) : {};
export function HarnessBadge({ source, className }: { source: string; className?: string }) {
  const { label, Glyph } = harness(source);
  return (
    <Badge variant="harness" className={className} {...harnessProps(source)}>
      <Glyph className="size-3.5" />
      {label}
    </Badge>
  );
}
export function HarnessStripe({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("absolute inset-y-2 left-0 w-[3px] rounded-full bg-harness", className)}
    />
  );
}
