import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleAlert, Search as SearchIcon, TimerOff } from "lucide-react";
import { ApiError, routes } from "@openhivemind/shared";
import { api } from "../api";
import { time } from "../lib/format";
import { HarnessBadge } from "../components/harness-badge";
import { Checkbox, EmptyState, ErrorState, Loading, PageHeader, page } from "../components/states";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
type Query = { q?: string; regex?: boolean; caseSensitive?: boolean; cursor?: string };
export function SearchPage() {
  const state = useSearch({ strict: false }) as Query;
  const navigate = useNavigate();
  const [query, setQuery] = useState(state.q ?? "");
  const result = useQuery({
    queryKey: ["search", state],
    queryFn: () =>
      api(routes.search, {
        body: {
          query: state.q!,
          regex: state.regex,
          caseSensitive: state.caseSensitive,
          cursor: state.cursor,
          limit: 20,
        },
      }),
    enabled: Boolean(state.q),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const go = (next: Query) => void navigate({ to: "/search", search: next });
  const status = result.error instanceof ApiError ? result.error.status : undefined;
  const stale = result.isPlaceholderData || result.isFetching;
  return (
    <main className={page}>
      <PageHeader
        eyebrow="Recall"
        title="Search your team’s work"
        description="Find a decision, a failed approach or the answer you remember seeing."
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          go({ ...state, q: query, cursor: undefined });
        }}
      >
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            aria-label="Search query"
            required
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Try "migration rollback" OR deadlock'
            className="h-12 pl-10 text-base"
          />
        </div>
        <Button type="submit" variant="solid" size="lg">
          Search
        </Button>
      </form>
      <div className="mt-3.5 mb-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
        <Label className="gap-2">
          <Checkbox
            checked={Boolean(state.regex)}
            onChange={(event) => go({ ...state, regex: event.target.checked, cursor: undefined })}
          />
          Regex
        </Label>
        <Label className="gap-2">
          <Checkbox
            checked={Boolean(state.caseSensitive)}
            onChange={(event) =>
              go({ ...state, caseSensitive: event.target.checked, cursor: undefined })
            }
          />
          Case sensitive (regex)
        </Label>
        <details className="max-w-[42rem]">
          <summary className="cursor-pointer">Query syntax</summary>
          <p className="mt-2 leading-relaxed">
            Terms are AND-ed. Use “phrases”, NOT or - to exclude, OR or | for alternatives, and
            parentheses to group. Regex uses PostgreSQL syntax.
          </p>
        </details>
      </div>
      {!state.q ? (
        <EmptyState
          icon={<SearchIcon aria-hidden="true" className="size-8 text-accent/70" />}
          title="Start with a question or a few keywords"
        >
          <p>Search matches captured prompts, replies, summaries and tool inputs.</p>
        </EmptyState>
      ) : status === 400 ? (
        <EmptyState
          icon={<CircleAlert aria-hidden="true" className="size-8 text-warning" />}
          title="That query could not be parsed"
        >
          <p>{result.error instanceof Error ? result.error.message : "Invalid query"}</p>
          <p>Check quotes, parentheses and operators, then search again.</p>
        </EmptyState>
      ) : status === 408 ? (
        <EmptyState
          icon={<TimerOff aria-hidden="true" className="size-8 text-warning" />}
          title="The search took too long"
        >
          <p>This is not an empty result: the server stopped before it finished.</p>
          <p>Narrow your filters — a project, a branch or a shorter time range — and try again.</p>
          <Button className="mt-1" onClick={() => void result.refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : result.isPending ? (
        <Loading label="Searching…" />
      ) : result.data.items.length ? (
        <section aria-busy={stale} className={stale ? "opacity-60" : undefined}>
          <p className="pb-2 text-xs text-muted" role="status">
            {stale
              ? "Updating results — showing the previous matches"
              : `${result.data.items.length} sessions on this page`}
          </p>
          {result.data.items.map((hit) => (
            <article className="border-t border-border py-5" key={hit.session.id}>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                <HarnessBadge source={hit.session.source} />
                <span className="font-mono">{hit.session.remote}</span>
                <span>
                  {hit.kind} · #{hit.seq}
                </span>
              </div>
              <h2 className="mb-2 text-[0.9375rem] font-semibold">
                <Link
                  className="text-foreground hover:text-accent-ink"
                  to="/sessions/$id"
                  params={{ id: hit.session.id }}
                  search={{ around: hit.seq }}
                >
                  {hit.session.title}
                </Link>
              </h2>
              <p className="mb-2 line-clamp-4 max-w-[72ch] whitespace-pre-wrap text-sm leading-relaxed">
                {hit.snippet}
              </p>
              <span className="text-xs text-muted">{time(hit.session.last_activity_at)}</span>
            </article>
          ))}
          {result.data.cursor && (
            <Button
              className="mt-6"
              onClick={() => go({ ...state, cursor: result.data.cursor ?? undefined })}
            >
              More results
            </Button>
          )}
        </section>
      ) : (
        <EmptyState title="No matching sessions">
          <p>Nothing matched “{state.q}”. Try fewer terms or a broader expression.</p>
        </EmptyState>
      )}
    </main>
  );
}
