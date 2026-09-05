import { cn } from "../lib/utils";
/** The horizontal lockup (mark + wordmark). Takes the current foreground colour. */
export function Logo({ className }: { className?: string }) {
  return <span role="img" aria-label="openhivemind" className={cn("brand-logo h-6", className)} />;
}
/** The bare mark, used as a quiet illustration for empty and loading states. */
export function Mark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("brand-mark size-8", className)} />;
}
