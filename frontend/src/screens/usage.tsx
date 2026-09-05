import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
import { number } from "../lib/format";
import { ErrorState, Loading, PageHeader, page } from "../components/states";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
const keys = ["input", "output", "cache_read", "cache_creation"] as const;
export function UsagePage() {
  const [since, setSince] = useState("");
  const query = useQuery({
    queryKey: ["usage", since],
    queryFn: () =>
      api(routes.usage, { query: since ? { since: new Date(since).toISOString() } : {} }),
  });
  return (
    <main className={page}>
      <PageHeader
        eyebrow="Workspace"
        title="Token usage"
        description="Usage by project and model. No per-person rankings."
      />
      <div className="grid max-w-[13rem] gap-1.5">
        <Label htmlFor="usage-since">Since</Label>
        <Input
          id="usage-since"
          type="date"
          value={since}
          onChange={(event) => setSince(event.target.value)}
        />
      </div>
      {query.isPending ? (
        <Loading label="Loading usage…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="my-7 grid grid-cols-2 gap-6 border-y border-border py-7 md:grid-cols-4">
            {keys.map((key) => (
              <div key={key} className="grid gap-2">
                <span className="text-xs capitalize text-muted">{key.replace("_", " ")}</span>
                <strong className="text-2xl font-medium tracking-tight tabular-nums">
                  {number(query.data.totals?.[key])}
                </strong>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            {number(query.data.unknownMessages)} messages have no reported usage.
          </p>
          <div className="mt-7 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="border-b border-border py-3 pr-3 font-medium">Project</th>
                  <th className="border-b border-border px-3 py-3 font-medium">Model</th>
                  <th className="border-b border-border px-3 py-3 font-medium">Input</th>
                  <th className="border-b border-border px-3 py-3 font-medium">Output</th>
                  <th className="border-b border-border px-3 py-3 font-medium">Cache read</th>
                </tr>
              </thead>
              <tbody>
                {query.data.groups.map((group) => (
                  <tr key={group.remote + group.model}>
                    <td className="border-b border-border py-3 pr-3 font-mono">{group.remote}</td>
                    <td className="border-b border-border px-3 py-3 font-mono">
                      {group.model ?? "Unknown"}
                    </td>
                    <td className="border-b border-border px-3 py-3 tabular-nums">
                      {number(group.tokens.input)}
                    </td>
                    <td className="border-b border-border px-3 py-3 tabular-nums">
                      {number(group.tokens.output)}
                    </td>
                    <td className="border-b border-border px-3 py-3 tabular-nums">
                      {number(group.tokens.cache_read)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
