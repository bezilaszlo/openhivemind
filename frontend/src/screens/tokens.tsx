import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
import { time } from "../lib/format";
import { ErrorState, Loading, PageHeader, page } from "../components/states";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
export function Tokens() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const query = useQuery({ queryKey: ["tokens"], queryFn: () => api(routes.tokens), retry: false });
  const create = useMutation({
    mutationFn: async () => {
      const value = await api(routes.tokenCreate, { body: { name } });
      setSecret(value.token);
    },
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(routes.tokenDelete, { params: { id } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
  return (
    <main className={page}>
      <PageHeader
        eyebrow="Settings"
        title="Personal access tokens"
        description="A separate token for each laptop makes access easy to revoke."
      />
      <form
        className="flex flex-wrap items-end gap-3 border-b border-border pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid min-w-[12rem] flex-1 gap-1.5 sm:max-w-[20rem]">
          <Label htmlFor="token-name">Token name</Label>
          <Input
            id="token-name"
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Work laptop"
          />
        </div>
        <Button type="submit" variant="solid" disabled={create.isPending}>
          Create token
        </Button>
      </form>
      {secret && (
        <div className="my-5 rounded-md border border-accent/40 bg-accent/5 p-5 text-sm">
          <p>Copy this token now. It is shown only once.</p>
          <code className="my-3 block break-all font-mono text-xs">{secret}</code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(secret)}>
              Copy token
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret("")}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      {create.isError && <ErrorState error={create.error} />}
      {revoke.isError && <ErrorState error={revoke.error} />}
      {query.isPending ? (
        <Loading label="Loading tokens…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data.items.map((token) => (
          <div
            className="flex items-center justify-between gap-5 border-b border-border py-5"
            key={token.id}
          >
            <div className="min-w-0">
              <strong className="text-sm font-semibold">{token.name}</strong>
              <p className="mt-1 text-xs text-muted">
                {token.scopes.join(", ")} · Created {time(token.created_at)}
              </p>
            </div>
            <Button
              size="sm"
              className="text-destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(token.id)}
            >
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        ))
      )}
    </main>
  );
}
