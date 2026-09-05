import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { routes } from "@openhivemind/shared";
import { api } from "./api";
import { Button, ErrorState, Loading, PageHeader, number, time, useOrg } from "./components";
export function UsagePage() {
  const [since, setSince] = useState("");
  const query = useQuery({
    queryKey: ["usage", since],
    queryFn: () =>
      api(routes.usage, { query: since ? { since: new Date(since).toISOString() } : {} }),
  });
  return (
    <main>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Token usage"
        description="Usage by project and model. No per-person rankings."
      />
      <label className="date-filter">
        Since
        <input type="date" value={since} onChange={(event) => setSince(event.target.value)} />
      </label>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <div className="usage-totals">
            {(["input", "output", "cache_read", "cache_creation"] as const).map((key) => (
              <div key={key}>
                <span>{key.replace("_", " ")}</span>
                <strong>{number(query.data.totals?.[key])}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            {number(query.data.unknownMessages)} messages have no reported usage.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Model</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cache read</th>
                </tr>
              </thead>
              <tbody>
                {query.data.groups.map((group) => (
                  <tr key={group.remote + group.model}>
                    <td>{group.remote}</td>
                    <td>{group.model ?? "Unknown"}</td>
                    <td>{number(group.tokens.input)}</td>
                    <td>{number(group.tokens.output)}</td>
                    <td>{number(group.tokens.cache_read)}</td>
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
    <main>
      <PageHeader
        eyebrow="SETTINGS"
        title="Personal access tokens"
        description="A separate token for each laptop makes access easy to revoke."
      />
      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Token name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Work laptop"
          />
        </label>
        <Button className="primary" disabled={create.isPending}>
          Create token
        </Button>
      </form>
      {secret && (
        <div className="notice">
          <p>Copy this token now. It is shown only once.</p>
          <code className="secret">{secret}</code>
          <div className="actions">
            <Button onClick={() => void navigator.clipboard.writeText(secret)}>Copy token</Button>
            <Button onClick={() => setSecret("")}>Dismiss</Button>
          </div>
        </div>
      )}
      {create.isError && <ErrorState error={create.error} />}{" "}
      {revoke.isError && <ErrorState error={revoke.error} />}{" "}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        query.data.items.map((token) => (
          <div className="setting-row" key={token.id}>
            <div>
              <strong>{token.name}</strong>
              <p className="muted">
                {token.scopes.join(", ")} · Created {time(token.created_at)}
              </p>
            </div>
            <Button
              className="destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(token.id)}
            >
              Revoke
            </Button>
          </div>
        ))
      )}
    </main>
  );
}
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
  return (
    <main>
      <PageHeader
        eyebrow="SETTINGS"
        title={org.data?.name ?? "Organisation"}
        description="Everyone in the organisation can read the same shared history."
      />
      {org.data?.role === "admin" && (
        <section>
          <h2>Invite a teammate</h2>
          <form
            className="filter-bar"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <label>
              Email <span className="muted">(optional)</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Open invite"
              />
            </label>
            <Button disabled={create.isPending}>Create invite</Button>
          </form>
          {invite && (
            <div className="notice">
              <p>Share this single-use invite token privately. It expires in seven days.</p>
              <code className="secret">{invite}</code>
              <Button onClick={() => void navigator.clipboard.writeText(invite)}>Copy</Button>
              <Button onClick={() => setInvite("")}>Dismiss</Button>
            </div>
          )}
          {create.isError && <ErrorState error={create.error} />}
        </section>
      )}
      <h2 className="section-title">Members</h2>
      {role.isError && <ErrorState error={role.error} />}{" "}
      {members.isPending ? (
        <Loading />
      ) : members.isError ? (
        <ErrorState error={members.error} />
      ) : (
        members.data.items.map((member) => (
          <div className="setting-row" key={member.userId}>
            <div>
              <strong>{member.name}</strong>
              <p className="muted">{member.email}</p>
            </div>
            {org.data?.role === "admin" ? (
              <select
                aria-label={`Role for ${member.name}`}
                value={member.role}
                disabled={role.isPending}
                onChange={(event) =>
                  role.mutate({ id: member.userId, role: event.target.value as "admin" | "member" })
                }
              >
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </select>
            ) : (
              <span className="badge">{member.role}</span>
            )}
          </div>
        ))
      )}
    </main>
  );
}
