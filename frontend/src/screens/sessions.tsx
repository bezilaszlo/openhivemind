import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
import { useChanges } from "../lib/changes";
import { SessionRow } from "../components/session-row";
import { Checkbox, EmptyState, ErrorState, Loading, PageHeader, page } from "../components/states";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
type Query = {
  remote?: string;
  branch?: string;
  mine?: boolean;
  subagents?: boolean;
  nested?: boolean;
  inherited?: boolean;
  cursor?: string;
};
const toggles = [
  { key: "mine", label: "Only mine" },
  { key: "subagents", label: "With subagents" },
  { key: "nested", label: "Nested" },
  { key: "inherited", label: "Inherited model" },
] as const;
export function Sessions() {
  const search = useSearch({ strict: false }) as Query;
  const navigate = useNavigate();
  const [remote, setRemote] = useState(search.remote ?? "");
  const [branch, setBranch] = useState(search.branch ?? "");
  const query = useQuery({
    queryKey: ["sessions", search],
    queryFn: () => api(routes.sessions, { query: { ...search, limit: 20 } }),
    retry: false,
  });
  useChanges();
  const filtered =
    toggles.some(({ key }) => search[key]) || Boolean(search.remote || search.branch);
  const go = (next: Query) => void navigate({ to: "/", search: { ...next, cursor: undefined } });
  const chips: { label: string; clear: Query }[] = [];
  if (search.remote)
    chips.push({ label: `Project: ${search.remote}`, clear: { ...search, remote: undefined } });
  if (search.branch)
    chips.push({ label: `Branch: ${search.branch}`, clear: { ...search, branch: undefined } });
  for (const { key, label } of toggles)
    if (search[key]) chips.push({ label, clear: { ...search, [key]: undefined } });
  return (
    <main className={page}>
      <PageHeader
        eyebrow="Workspace"
        title="Sessions"
        description="The work your team explored, in their own words."
      />
      <form
        className="flex flex-wrap items-end gap-3 border-b border-border pb-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          go({ remote: remote || undefined, branch: branch || undefined, mine: search.mine });
        }}
      >
        <div className="grid min-w-[10rem] flex-1 gap-1.5 sm:max-w-[18rem]">
          <Label htmlFor="filter-project">Project</Label>
          <Input
            id="filter-project"
            value={remote}
            onChange={(event) => setRemote(event.target.value)}
            placeholder="All projects"
          />
        </div>
        <div className="grid min-w-[10rem] flex-1 gap-1.5 sm:max-w-[18rem]">
          <Label htmlFor="filter-branch">Branch</Label>
          <Input
            id="filter-branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="All branches"
          />
        </div>
        <Button type="submit">Apply filters</Button>
        {toggles.map(({ key, label }) => (
          <Label key={key} className="h-9 gap-2 text-sm text-foreground">
            <Checkbox
              checked={Boolean(search[key])}
              onChange={(event) => go({ ...search, [key]: event.target.checked || undefined })}
            />
            {label}
          </Label>
        ))}
      </form>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          {chips.map((chip) => (
            <Button
              key={chip.label}
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setRemote(chip.clear.remote ?? "");
                setBranch(chip.clear.branch ?? "");
                go(chip.clear);
              }}
            >
              {chip.label}
              <X aria-hidden="true" />
              <span className="sr-only">Remove filter</span>
            </Button>
          ))}
        </div>
      )}
      {query.isPending ? (
        <Loading label="Loading sessions…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <>
          <div className="flex items-baseline justify-between pb-2 pt-7 text-xs text-muted">
            <span className="font-semibold uppercase tracking-[0.14em]">Recent activity</span>
            <span>{query.data.items.length} sessions on this page</span>
          </div>
          <section aria-label="Sessions">
            {query.data.items.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </section>
          {query.data.cursor && (
            <Button
              className="mt-6"
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { ...search, cursor: query.data.cursor ?? undefined },
                })
              }
            >
              Older sessions <ChevronRight />
            </Button>
          )}
        </>
      ) : filtered ? (
        <EmptyState title="No matching sessions">
          <p>Try a broader project or branch filter.</p>
          <Link className="text-accent-ink hover:underline" to="/" search={{}}>
            Clear filters
          </Link>
        </EmptyState>
      ) : (
        <EmptyState title="Your workspace is ready">
          <p>Set up capture on your laptop to add the first session.</p>
          <code className="mt-1 rounded-md border border-border bg-surface px-4 py-3 font-mono text-xs">
            openhivemind setup {window.location.origin}
          </code>
        </EmptyState>
      )}
    </main>
  );
}
