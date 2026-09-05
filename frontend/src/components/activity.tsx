import { useSyncExternalStore } from "react";
import type { Session } from "@openhivemind/shared";
import { time } from "../lib/format";
import { cn } from "../lib/utils";
import { harnessProps } from "./harness-badge";
/** A session counts as active while capture is open and its last message is recent. */
export const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
export type Activity = "active" | "idle" | "ended";
export function activityOf(
  session: Pick<Session, "completed" | "last_activity_at">,
  now = Date.now(),
): Activity {
  if (session.completed) return "ended";
  return now - Date.parse(session.last_activity_at) < ACTIVE_WINDOW_MS ? "active" : "idle";
}
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 1000],
  ["minute", 60000],
  ["hour", 3600000],
  ["day", 86400000],
  ["month", 2592000000],
  ["year", 31536000000],
];
export function relativeTime(value: string, now = Date.now()) {
  const elapsed = Date.parse(value) - now;
  let index = 0;
  while (index + 1 < units.length && Math.abs(elapsed) >= units[index + 1]![1]) index += 1;
  const [unit, size] = units[index]!;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" }).format(
    Math.round(elapsed / size),
    unit,
  );
}
/** One timer for every indicator on the page, so relative labels age on their own. */
let clock = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    clock = Date.now();
    for (const notify of listeners) notify();
  }, 30000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const readClock = () => clock;
export function SessionActivity({
  session,
  className,
}: {
  session: Pick<Session, "completed" | "last_activity_at" | "source">;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribe, readClock, readClock);
  const state = activityOf(session, now);
  const relative = relativeTime(session.last_activity_at, now);
  return (
    <span
      {...harnessProps(session.source)}
      data-activity={state}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {state === "active" && (
        <span data-slot="activity-dot" aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-harness opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-harness" />
        </span>
      )}
      <time dateTime={session.last_activity_at} title={time(session.last_activity_at)}>
        {state === "active"
          ? `active ${relative}`
          : state === "ended"
            ? `ended ${relative}`
            : relative}
      </time>
    </span>
  );
}
