import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Session } from "@openhivemind/shared";
import { number, totalTokens } from "../lib/format";
import { AgentsCell } from "./agents";
import { SessionActivity } from "./activity";
import { HarnessBadge, HarnessStripe, harnessProps } from "./harness-badge";
export function SessionRow({ session }: { session: Session }) {
  const tokens = totalTokens(session.tokens);
  // The row counts the whole tree; the tooltip keeps the parent's own number.
  const rolled =
    tokens === null
      ? null
      : tokens + (session.agents ? session.agents.inputTokens + session.agents.outputTokens : 0);
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
          title={session.title || "Untitled session"}
          className="min-w-0 max-w-full truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-foreground hover:text-accent-ink"
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
        <AgentsCell session={session} />
        <span title={tokens === null ? undefined : `Parent session only: ${number(tokens)}`}>
          {tokens === null ? "Usage unknown" : `${number(rolled)} tokens`}
        </span>
      </div>
      <ChevronRight aria-hidden="true" className="absolute right-1 top-5 size-4 text-muted" />
    </article>
  );
}
