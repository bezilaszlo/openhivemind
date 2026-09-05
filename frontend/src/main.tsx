import {
  Button,
  ErrorState,
  Loading,
  PageHeader,
  SessionRow,
  MessageView,
  number,
  time,
  useOrg,
} from "./components";
import { UsagePage, Tokens, Organisation } from "./settings";
import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  Search as SearchIcon,
  MessagesSquare,
  ChartNoAxesColumn,
  KeyRound,
  Users,
  Sun,
  Moon,
  ChevronRight,
  Trash2,
  Copy,
  LogOut,
  Menu,
} from "lucide-react";
import { routes, authRoutes } from "@openhivemind/shared";
import { api, isDemo } from "./api";
import "./styles.css";
function Shell() {
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("openhivemind-theme") ?? "system");
  const org = useOrg();
  const client = useQueryClient();
  const navigate = useNavigate();
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("openhivemind-theme", next);
  }
  const logout = useMutation({
    mutationFn: () => api(authRoutes.logout),
    onSuccess: () => {
      client.clear();
      void navigate({ to: "/login" });
    },
  });
  return (
    <div className="app">
      <aside className={menu ? "navigation open" : "navigation"}>
        <Link className="brand" to="/">
          Open Hivemind<span>Team session history</span>
        </Link>
        <nav aria-label="Main navigation">
          {[
            { to: "/", label: "Sessions", Icon: MessagesSquare },
            { to: "/search", label: "Search", Icon: SearchIcon },
            { to: "/usage", label: "Usage", Icon: ChartNoAxesColumn },
            { to: "/tokens", label: "Tokens", Icon: KeyRound },
            { to: "/organisation", label: "Organisation", Icon: Users },
          ].map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMenu(false)}
              activeProps={{ className: "active" }}
              activeOptions={{ exact: true }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-footer">
          <span>{org.data?.name ?? "Self-hosted workspace"}</span>
          <Button onClick={toggleTheme} aria-label="Toggle light and dark theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Appearance
          </Button>
          {org.data && (
            <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut size={16} /> Sign out
            </Button>
          )}
        </div>
      </aside>
      <div className="workspace">
        {isDemo && (
          <div className="demo-banner">
            Interactive preview · Illustrative sessions · Changes stay in this demo
          </div>
        )}
        <header className="mobile-bar">
          <Button aria-label="Open navigation" onClick={() => setMenu(!menu)}>
            <Menu size={20} />
          </Button>
          <span>Open Hivemind</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
function Login() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const client = useQueryClient();
  const navigate = useNavigate();
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api(routes.providers) });
  const login = useMutation({
    mutationFn: () =>
      register
        ? api(authRoutes.register, {
            body: { name, email, password },
            headers: invite ? { "x-openhivemind-invite": invite } : {},
          })
        : api(authRoutes.login, { body: { email, password } }),
    onSuccess: () => {
      setPassword("");
      void client.invalidateQueries();
      void navigate({ to: "/" });
    },
  });
  const oidc = useMutation({
    mutationFn: () =>
      api(authRoutes.oidc, {
        body: { provider: "oidc", callbackURL: window.location.origin + "/" },
      }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  return (
    <main className="auth-page">
      <PageHeader
        eyebrow="YOUR TEAM’S SHARED MEMORY"
        title={register ? "Join your workspace" : "Welcome back"}
        description="Find the work, decisions and context behind your team’s code."
      />
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        {register && (
          <label>
            Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={register ? 12 : 1}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </label>
        {register && (
          <label>
            Invite token <span className="muted">(not needed for the first administrator)</span>
            <input
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        {login.isError && <ErrorState error={login.error} />}
        <Button className="primary" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : register ? "Create account" : "Sign in"}
        </Button>
      </form>
      {providers.data?.providers.includes("oidc") && (
        <Button onClick={() => oidc.mutate()} disabled={oidc.isPending}>
          Continue with SSO
        </Button>
      )}
      {oidc.isError && <ErrorState error={oidc.error} />}
      <Button className="quiet" onClick={() => setRegister(!register)}>
        {register ? "Already have an account? Sign in" : "New here? Create an account"}
      </Button>
    </main>
  );
}
function Sessions() {
  const search = useSearch({ strict: false }) as {
    remote?: string;
    branch?: string;
    mine?: boolean;
    cursor?: string;
  };
  const navigate = useNavigate();
  const [remote, setRemote] = useState(search.remote ?? "");
  const [branch, setBranch] = useState(search.branch ?? "");
  const query = useQuery({
    queryKey: ["sessions", search],
    queryFn: () => api(routes.sessions, { query: { ...search, limit: 20 } }),
    retry: false,
  });
  function filter(event: FormEvent) {
    event.preventDefault();
    void navigate({
      to: "/",
      search: { remote: remote || undefined, branch: branch || undefined, mine: search.mine },
    });
  }
  return (
    <main>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Sessions"
        description="The work your team explored, in their own words."
      />
      <form className="filter-bar" onSubmit={filter}>
        <label>
          Project
          <input
            value={remote}
            onChange={(event) => setRemote(event.target.value)}
            placeholder="All projects"
          />
        </label>
        <label>
          Branch
          <input
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="All branches"
          />
        </label>
        <Button>Apply filters</Button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(search.mine)}
            onChange={(event) =>
              void navigate({
                to: "/",
                search: { ...search, mine: event.target.checked, cursor: undefined },
              })
            }
          />
          Only mine
        </label>
        {(search.remote || search.branch || search.mine) && (
          <Link to="/" search={{}}>
            Clear filters
          </Link>
        )}
      </form>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <>
          <div className="list-caption">
            <span>RECENT ACTIVITY</span>
            <span>{query.data.items.length} sessions on this page</span>
          </div>
          <section aria-label="Sessions">
            {query.data.items.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </section>
          {query.data.cursor && (
            <Button
              className="next-page"
              onClick={() =>
                void navigate({
                  to: "/",
                  search: { ...search, cursor: query.data.cursor ?? undefined },
                })
              }
            >
              Older sessions <ChevronRight size={16} />
            </Button>
          )}
        </>
      ) : (
        <div className="empty">
          <MessagesSquare size={32} />
          <h2>
            {search.remote || search.branch || search.mine
              ? "No matching sessions"
              : "Your workspace is ready"}
          </h2>
          <p>
            {search.remote || search.branch || search.mine
              ? "Try a broader project or branch filter."
              : "Set up capture on your laptop to add the first session."}
          </p>
          <code>openhivemind setup {window.location.origin}</code>
        </div>
      )}
    </main>
  );
}
function Reader() {
  const { id } = detailRoute.useParams();
  const state = useSearch({ strict: false }) as {
    around?: number;
    kind?: "prompt" | "tool_call";
    from?: number;
  };
  const navigate = useNavigate();
  const org = useOrg();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["session", id, state],
    queryFn: () =>
      api(routes.session, { params: { id }, query: { ...state, context: 10, maxChars: 40000 } }),
    retry: false,
  });
  const children = useQuery({
    queryKey: ["children", id],
    queryFn: () =>
      api(routes.sessions, { query: { parent: id, includeChildren: true, limit: 100 } }),
  });
  const remove = useMutation({
    mutationFn: () => api(routes.purge, { params: { id } }),
    onSuccess: () => {
      void client.invalidateQueries();
      void navigate({ to: "/" });
    },
  });
  if (query.isPending)
    return (
      <main>
        <Loading />
      </main>
    );
  if (query.isError)
    return (
      <main>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </main>
    );
  const { session, messages } = query.data;
  return (
    <main className="reader">
      <Link className="back-link" to="/">
        ← Sessions
      </Link>
      <PageHeader
        eyebrow={session.remote}
        title={session.title}
        description={`${session.source} · ${session.branch} · ${time(session.last_activity_at)}`}
      >
        <div className="actions">
          <Button onClick={() => void navigator.clipboard.writeText(window.location.href)}>
            <Copy size={16} />
            Copy link
          </Button>
          {session.owner_user_id === org.data?.userId && (
            <Button className="destructive" onClick={() => setConfirm(true)}>
              <Trash2 size={16} />
              Delete
            </Button>
          )}
        </div>
      </PageHeader>
      <div className="reader-layout">
        <section>
          {session.summary && (
            <aside className="summary-card">
              <h2>Current summary</h2>
              <p>{session.summary}</p>
            </aside>
          )}
          <div className="feed-controls">
            <span>
              {session.messageCount} messages ·{" "}
              {session.tokens ? `${number(session.tokens.output)} output tokens` : "Usage unknown"}
            </span>
            <label>
              Show
              <select
                value={state.kind ?? ""}
                onChange={(event) =>
                  void navigate({
                    to: "/sessions/$id",
                    params: { id },
                    search: { ...state, kind: event.target.value || undefined },
                  })
                }
              >
                <option value="">All messages</option>
                <option value="prompt">Prompts only</option>
                <option value="tool_call">Tool calls only</option>
              </select>
            </label>
          </div>
          {state.around &&
            state.kind &&
            !messages.some((message) => message.seq === state.around) && (
              <div className="notice">
                This filter may hide the linked message.{" "}
                <Button
                  onClick={() =>
                    void navigate({
                      to: "/sessions/$id",
                      params: { id },
                      search: { ...state, kind: undefined },
                    })
                  }
                >
                  Clear filter
                </Button>
              </div>
            )}
          {messages.map((message) => (
            <MessageView key={message.seq} message={message} />
          ))}
          {!messages.length && <p className="empty">No messages in this window.</p>}
          {query.data.cursor && (
            <Button
              onClick={() =>
                void navigate({
                  to: "/sessions/$id",
                  params: { id },
                  search: { from: (messages.at(-1)?.seq ?? 0) + 1, kind: state.kind },
                })
              }
            >
              Load next window
            </Button>
          )}
        </section>
        <aside className="agent-tree">
          <h2>Session context</h2>
          <dl>
            <dt>Models</dt>
            <dd>{session.models.join(", ") || "Unknown"}</dd>
            <dt>Started</dt>
            <dd>{time(session.started_at)}</dd>
            <dt>Capture</dt>
            <dd>{session.completed ? "Completed" : "Completion unknown"}</dd>
          </dl>
          <h2>Agents</h2>
          {children.data?.items.length ? (
            children.data.items.map((child) => (
              <Link key={child.id} to="/sessions/$id" params={{ id: child.id }}>
                {child.title}
              </Link>
            ))
          ) : (
            <p className="muted">No child sessions</p>
          )}
          {session.parent_session_id && (
            <Link to="/sessions/$id" params={{ id: session.parent_session_id }}>
              Back to parent
            </Link>
          )}
        </aside>
      </div>
      {confirm && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Delete this session?</h2>
            <p>
              “{session.title}” and its descendants will be permanently deleted. Delayed uploads
              cannot restore them.
            </p>
            {remove.isError && <ErrorState error={remove.error} />}
            <div className="actions">
              <Button autoFocus onClick={() => setConfirm(false)} disabled={remove.isPending}>
                Cancel
              </Button>
              <Button
                className="destructive"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                {remove.isPending ? "Deleting…" : "Delete session"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function SearchPage() {
  const state = useSearch({ strict: false }) as {
    q?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    cursor?: string;
  };
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
    retry: false,
  });
  return (
    <main>
      <PageHeader
        eyebrow="RECALL"
        title="Search your team’s work"
        description="Find a decision, a failed approach or the answer you remember seeing."
      />
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ to: "/search", search: { ...state, q: query, cursor: undefined } });
        }}
      >
        <label className="query-input">
          <SearchIcon size={20} />
          <input
            aria-label="Search query"
            required
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Try "migration rollback" OR deadlock'
          />
        </label>
        <Button className="primary">Search</Button>
      </form>
      <div className="search-options">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(state.regex)}
            onChange={(event) =>
              void navigate({
                to: "/search",
                search: { ...state, regex: event.target.checked, cursor: undefined },
              })
            }
          />
          Regex
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={Boolean(state.caseSensitive)}
            onChange={(event) =>
              void navigate({
                to: "/search",
                search: { ...state, caseSensitive: event.target.checked, cursor: undefined },
              })
            }
          />
          Case sensitive (regex)
        </label>
        <details>
          <summary>Query syntax</summary>
          <p>
            Terms are AND-ed. Use “phrases”, NOT or - to exclude, OR or | for alternatives, and
            parentheses to group. Regex uses PostgreSQL syntax.
          </p>
        </details>
      </div>
      {!state.q ? (
        <div className="empty">
          <SearchIcon size={32} />
          <h2>Start with a question or a few keywords</h2>
          <p>Search matches captured prompts, replies, summaries and tool inputs.</p>
        </div>
      ) : result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <ErrorState error={result.error} />
      ) : result.data?.items.length ? (
        <section>
          {result.data.items.map((hit) => (
            <article className="search-hit" key={hit.session.id}>
              <div className="metadata">
                <span>{hit.session.remote}</span>
                <span>
                  {hit.kind} · #{hit.seq}
                </span>
              </div>
              <h2>
                <Link
                  to="/sessions/$id"
                  params={{ id: hit.session.id }}
                  search={{ around: hit.seq }}
                >
                  {hit.session.title}
                </Link>
              </h2>
              <p>{hit.snippet}</p>
              <span className="muted">{time(hit.session.last_activity_at)}</span>
            </article>
          ))}
          {result.data.cursor && (
            <Button
              onClick={() =>
                void navigate({
                  to: "/search",
                  search: { ...state, cursor: result.data.cursor ?? undefined },
                })
              }
            >
              More results
            </Button>
          )}
        </section>
      ) : (
        <div className="empty">
          <h2>No matching sessions</h2>
          <p>Try fewer terms or a broader expression.</p>
        </div>
      )}
    </main>
  );
}
const rootRoute = createRootRoute({ component: Shell });
const searchParams = (input: Record<string, unknown>) => input;
const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Sessions,
  validateSearch: searchParams,
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$id",
  component: Reader,
  validateSearch: searchParams,
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchPage,
  validateSearch: searchParams,
});
const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});
const tokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tokens",
  component: Tokens,
});
const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/organisation",
  component: Organisation,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([
    sessionsRoute,
    loginRoute,
    detailRoute,
    searchRoute,
    usageRoute,
    tokensRoute,
    orgRoute,
  ]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const savedTheme = localStorage.getItem("openhivemind-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { staleTime: 10000, retry: 1 } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
