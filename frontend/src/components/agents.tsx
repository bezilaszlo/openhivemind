import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { routes, type Agents, type Session } from "@openhivemind/shared";
import { api } from "../api";
import { number } from "../lib/format";
import { cn } from "../lib/utils";
import { harnessProps } from "./harness-badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
/** "claude-sonnet-4-6" reads as "sonnet-4-6"; the vendor is already in the harness badge. */
export const shortModel = (model: string) =>
  model
    .split("/")
    .at(-1)!
    .replace(/^(claude|anthropic|openai|google|models)[.-]/, "");
export function ModelChip({
  model,
  count = 1,
  inherited = 0,
  className,
}: {
  model: string;
  count?: number;
  inherited?: number;
  className?: string;
}) {
  const all = inherited >= count;
  return (
    <span
      data-inherited={inherited > 0 ? (all ? "all" : "some") : undefined}
      title={
        all
          ? "Inherited the session model"
          : inherited
            ? `${inherited} of ${count} inherited the session model`
            : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] leading-4",
        all ? "border-dashed border-border text-muted" : "border-border bg-hover text-foreground",
        className,
      )}
    >
      {shortModel(model)}
      {count > 1 && <span className="tabular-nums">×{count}</span>}
      {inherited > 0 && !all && <span className="text-muted tabular-nums">~{inherited}</span>}
    </span>
  );
}
export function DepthMarker({ depth }: { depth: number }) {
  return (
    <span
      title="A subagent spawned its own subagents"
      className="rounded-md border border-dotted border-muted px-1.5 py-0.5 text-[0.6875rem] leading-4 text-muted"
    >
      {depth} deep
    </span>
  );
}
export function AgentChips({ session, agents }: { session: Session; agents: Agents }) {
  return (
    <>
      <ModelChip model={session.models[0] ?? "Unknown"} />
      {agents.models.map((use) => (
        <ModelChip key={use.model} model={use.model} count={use.count} inherited={use.inherited} />
      ))}
      {agents.maxDepth >= 2 && <DepthMarker depth={agents.maxDepth} />}
    </>
  );
}
export function depthGroups(children: Session[]) {
  const byDepth = new Map<number, Session[]>();
  for (const child of children) {
    const depth = child.spawn_depth || 1;
    const group = byDepth.get(depth);
    if (group) group.push(child);
    else byDepth.set(depth, [child]);
  }
  return [...byDepth.entries()]
    .sort(([left], [right]) => left - right)
    .map(([depth, group]) => ({ depth, group }));
}
export function AgentList({ sessions }: { sessions: Session[] }) {
  return (
    <div className="grid gap-3">
      {depthGroups(sessions).map(({ depth, group }) => (
        <section key={depth}>
          <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Depth {depth}
          </p>
          <ul className="grid gap-1">
            {group.map((child) => (
              <li
                key={child.id}
                {...harnessProps(child.source)}
                className="relative pl-3"
                style={{ marginLeft: (depth - 1) * 14 }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-harness"
                />
                <Link
                  to="/sessions/$id"
                  params={{ id: child.id }}
                  className="block rounded-sm px-2 py-1.5 text-xs leading-snug text-foreground hover:bg-hover"
                >
                  <span className="mb-1 flex items-baseline gap-1.5">
                    <span aria-hidden="true" className="text-muted">
                      {"↳".repeat(depth)}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={child.title || "Untitled session"}
                    >
                      {child.title || "Untitled session"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-muted">
                    <ModelChip
                      model={child.models[0] ?? "Unknown"}
                      inherited={child.model_explicit ? 0 : 1}
                    />
                    <span className="tabular-nums">{child.messageCount} messages</span>
                    <span className="font-mono tabular-nums">
                      ↑{number(child.tokens?.input)} ↓{number(child.tokens?.output)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
export function useAgents(id: string, enabled = true) {
  return useQuery({
    queryKey: ["children", id],
    queryFn: () =>
      api(routes.sessions, { query: { parent: id, includeChildren: true, limit: 100 } }),
    enabled,
  });
}
/** The row cell: the models this session and its subagents ran, and how deep they went. */
export function AgentsCell({ session }: { session: Session }) {
  const agents = session.agents;
  if (!agents) return <span>Main session</span>;
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="relative z-10 inline-flex flex-wrap items-center gap-1.5 rounded-md text-left"
          aria-label={`${agents.count} subagents, ${agents.maxDepth} deep`}
        >
          <span>
            {agents.count} agent{agents.count === 1 ? "" : "s"}
          </span>
          <AgentChips session={session} agents={agents} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent>
        <AgentTree id={session.id} />
      </HoverCardContent>
    </HoverCard>
  );
}
function AgentTree({ id }: { id: string }) {
  const children = useAgents(id);
  if (children.isPending) return <p className="text-xs text-muted">Loading subagents…</p>;
  if (children.isError || !children.data.items.length)
    return <p className="text-xs text-muted">No subagent detail available.</p>;
  return <AgentList sessions={children.data.items} />;
}
