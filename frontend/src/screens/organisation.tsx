import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
import { useOrg } from "../components/app-shell";
import { ErrorState, Loading, PageHeader, page } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
export function Organisation() {
  const org = useOrg();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => api(routes.members),
    retry: false,
  });
  const create = useMutation({
    mutationFn: async () => {
      const value = await api(routes.inviteCreate, {
        body: { email: email || undefined, role: "member" },
      });
      setInvite(value.token);
    },
    onSuccess: () => {
      setEmail("");
    },
  });
  const role = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) =>
      api(routes.memberRole, { params: { id }, body: { role } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["members"] });
    },
  });
  const admin = org.data?.role === "admin";
  return (
    <main className={page}>
      <PageHeader
        eyebrow="Settings"
        title={org.data?.name ?? "Organisation"}
        description="Everyone in the organisation can read the same shared history."
      />
      {admin && (
        <section className="border-b border-border pb-6">
          <h2 className="mb-3 text-sm font-semibold">Invite a teammate</h2>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid min-w-[12rem] flex-1 gap-1.5 sm:max-w-[20rem]">
              <Label htmlFor="invite-email">
                Email <span className="font-normal">(optional)</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Open invite"
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Create invite
            </Button>
          </form>
          {invite && (
            <div className="my-5 rounded-md border border-accent/40 bg-accent/5 p-5 text-sm">
              <p>Share this single-use invite token privately. It expires in seven days.</p>
              <code className="my-3 block break-all font-mono text-xs">{invite}</code>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void navigator.clipboard.writeText(invite)}>
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInvite("")}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          {create.isError && <ErrorState error={create.error} />}
        </section>
      )}
      <h2 className="mb-1 mt-8 text-sm font-semibold">Members</h2>
      {role.isError && <ErrorState error={role.error} />}
      {members.isPending ? (
        <Loading label="Loading members…" />
      ) : members.isError ? (
        <ErrorState error={members.error} retry={() => void members.refetch()} />
      ) : (
        members.data.items.map((member) => (
          <div
            className="flex items-center justify-between gap-5 border-b border-border py-5"
            key={member.userId}
          >
            <div className="min-w-0">
              <strong className="text-sm font-semibold">{member.name}</strong>
              <p className="mt-1 text-xs text-muted">{member.email}</p>
            </div>
            {admin ? (
              <Select
                value={member.role}
                disabled={role.isPending}
                onValueChange={(value) =>
                  role.mutate({ id: member.userId, role: value as "admin" | "member" })
                }
              >
                <SelectTrigger className="h-8 text-xs" aria-label={`Role for ${member.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge>{member.role}</Badge>
            )}
          </div>
        ))
      )}
    </main>
  );
}
