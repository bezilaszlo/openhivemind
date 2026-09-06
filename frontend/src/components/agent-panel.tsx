import { Link } from "@tanstack/react-router";
import { CornerLeftUp } from "lucide-react";
import type { Session } from "@openhivemind/shared";
import { time } from "../lib/format";
import { AgentChips, AgentList } from "./agents";
export function AgentPanel({ session, agents }: { session: Session; agents: Session[] }) {
  const rollup = session.agents;
  return (
    <div className="grid gap-7 text-xs text-muted">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
          Session context
        </h2>
        <dl className="grid gap-2">
          <dt className="text-muted">Models</dt>
          <dd className="mb-2 break-words text-foreground">
            {session.models.join(", ") || "Unknown"}
          </dd>
          <dt className="text-muted">Started</dt>
          <dd className="mb-2 text-foreground">{time(session.started_at)}</dd>
          <dt className="text-muted">Last received</dt>
          <dd className="mb-2 text-foreground">{time(session.received_at)}</dd>
          <dt className="text-muted">Capture</dt>
          <dd className="text-foreground">
            {session.completed ? "Completed" : "Completion unknown"}
          </dd>
        </dl>
      </section>
      <section>
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
          Subagents{rollup ? ` (${rollup.count})` : ""}
        </h2>
        {rollup ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <AgentChips session={session} agents={rollup} />
            </div>
            <AgentList sessions={agents} />
          </>
        ) : (
          <p>No subagent sessions</p>
        )}
        {session.parent_session_id && (
          <Link
            to="/sessions/$id"
            params={{ id: session.parent_session_id }}
            className="mt-4 inline-flex items-center gap-1.5 text-accent-ink hover:underline"
          >
            <CornerLeftUp className="size-3.5" />
            Back to the root session
          </Link>
        )}
      </section>
    </div>
  );
}
