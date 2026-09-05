import { Link } from "@tanstack/react-router";
import { CornerLeftUp } from "lucide-react";
import type { Session } from "@openhivemind/shared";
import { time } from "../lib/format";
import { harness } from "../lib/harness";
import { harnessProps } from "./harness-badge";
export function AgentPanel({ session, agents }: { session: Session; agents: Session[] }) {
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
          <dt className="text-muted">Capture</dt>
          <dd className="text-foreground">
            {session.completed ? "Completed" : "Completion unknown"}
          </dd>
        </dl>
      </section>
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
          Agents
        </h2>
        {agents.length ? (
          <ul className="grid gap-1">
            {agents.map((child) => {
              const { label, Glyph } = harness(child.source);
              return (
                <li key={child.id} {...harnessProps(child.source)} className="relative pl-3">
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-harness"
                  />
                  <Link
                    to="/sessions/$id"
                    params={{ id: child.id }}
                    className="block rounded-sm py-1.5 pl-2 pr-1 leading-snug text-foreground hover:bg-hover"
                  >
                    <span className="mb-0.5 flex items-center gap-1.5 text-harness">
                      <Glyph className="size-3.5" />
                      {label}
                    </span>
                    {child.title || "Untitled session"}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No child sessions</p>
        )}
        {session.parent_session_id && (
          <Link
            to="/sessions/$id"
            params={{ id: session.parent_session_id }}
            className="mt-4 inline-flex items-center gap-1.5 text-accent-ink hover:underline"
          >
            <CornerLeftUp className="size-3.5" />
            Back to parent
          </Link>
        )}
      </section>
    </div>
  );
}
