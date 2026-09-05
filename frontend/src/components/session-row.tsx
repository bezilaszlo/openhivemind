import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Session } from "@openhivemind/shared";
import { number, totalTokens } from "../lib/format";
import { SessionActivity } from "./activity";
import { HarnessBadge, HarnessStripe, harnessProps } from "./harness-badge";
export function SessionRow({ session }: { session: Session }) {
  const tokens = totalTokens(session.tokens);
  return (
    <article
      {...harnessProps(session.source)}
      className="relative border-b border-border py-4 pl-4 pr-8 transition-colors hover:bg-surface"
    >
      <HarnessStripe />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link
          to="/sessions/$id"
          params={{ id: session.id }}
          className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground after:absolute after:inset-0 hover:text-accent-ink"
        >
          {session.title || "Untitled session"}
        </Link>
        <HarnessBadge source={session.source} />
      </div>
      <p className="mt-1.5 line-clamp-1 text-sm text-muted">
        {session.lastPrompt ?? session.lastReply ?? "No messages captured yet"}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-mono">{session.remote}</span>
        <span>{session.branch || "No branch"}</span>
        <SessionActivity session={session} />
        <span>
          {session.childCount
            ? `${session.childCount} agent${session.childCount === 1 ? "" : "s"}`
            : "Main session"}
        </span>
        <span>{tokens === null ? "Usage unknown" : `${number(tokens)} tokens`}</span>
      </div>
      <ChevronRight aria-hidden="true" className="absolute right-1 top-5 size-4 text-muted" />
    </article>
  );
}
