import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, Copy, PanelRight, Trash2 } from "lucide-react";
import { routes, type Message } from "@openhivemind/shared";
import { api } from "../api";
import { number } from "../lib/format";
import { useChanges } from "../lib/changes";
import { AgentPanel } from "../components/agent-panel";
import { SessionActivity } from "../components/activity";
import { useAgents } from "../components/agents";
import { useOrg } from "../components/app-shell";
import { HarnessBadge } from "../components/harness-badge";
import { MessageView } from "../components/message-view";
import { ErrorState, Loading, PageHeader, page } from "../components/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";

type Window = { around?: number; kind?: "prompt" | "tool_call"; from?: number; to?: number };
type PageParam = {
  around?: number;
  context?: number;
  from?: number;
  to?: number;
  last?: number;
  kind?: Window["kind"];
  maxChars: number;
  wholeMessages: true;
};

function ToolCalls({
  messages,
  source,
  around,
}: {
  messages: Message[];
  source: string;
  around?: number;
}) {
  return (
    <details
      className="border-t border-border px-1 py-3"
      open={messages.some((message) => message.seq === around)}
    >
      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-foreground">
        {messages.length} tool call{messages.length === 1 ? "" : "s"}
      </summary>
      <div className="mt-2 divide-y divide-border">
        {messages.map((message) => (
          <MessageView key={message.seq} message={message} source={source} />
        ))}
      </div>
    </details>
  );
}

function Transcript({
  messages,
  source,
  promptAuthor,
  around,
}: {
  messages: Message[];
  source: string;
  promptAuthor: string;
  around?: number;
}) {
  const items: React.ReactNode[] = [];
  for (let index = 0; index < messages.length;) {
    const message = messages[index]!;
    if (message.kind !== "tool_call") {
      items.push(
        <MessageView
          key={message.seq}
          message={message}
          source={source}
          promptAuthor={promptAuthor}
        />,
      );
      index += 1;
      continue;
    }
    const tools: Message[] = [];
    while (messages[index]?.kind === "tool_call") tools.push(messages[index++]!);
    items.push(
      <ToolCalls key={`tools-${tools[0]!.seq}`} messages={tools} source={source} around={around} />,
    );
  }
  return <>{items}</>;
}

export function Reader({ id }: { id: string }) {
  const state = useSearch({ strict: false }) as Window;
  const navigate = useNavigate();
  const org = useOrg();
  const client = useQueryClient();
  const [panel, setPanel] = useState(false);
  const [pinned, setPinned] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [reload, setReload] = useState(0);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const didInitialScroll = useRef(false);
  const scrolledAround = useRef<string | null>(null);
  const changes = useChanges(id);
  const initial: PageParam = state.around
    ? { around: state.around, context: 10, kind: state.kind, maxChars: 40000, wholeMessages: true }
    : state.from || state.to
      ? { from: state.from, to: state.to, kind: state.kind, maxChars: 40000, wholeMessages: true }
      : { last: 100, kind: state.kind, maxChars: 40000, wholeMessages: true };
  const query = useInfiniteQuery({
    queryKey: ["session", id, state.kind, state.around, state.from, state.to, reload],
    initialPageParam: initial,
    queryFn: ({ pageParam }) => api(routes.session, { params: { id }, query: pageParam }),
    getPreviousPageParam: (firstPage): PageParam | undefined => {
      const first = firstPage.messages[0];
      return firstPage.cursor && first && first.seq > 1
        ? { to: first.seq - 1, last: 100, kind: state.kind, maxChars: 40000, wholeMessages: true }
        : undefined;
    },
    getNextPageParam: () => undefined,
    retry: false,
  });
  const children = useAgents(id);
  const members = useQuery({
    queryKey: ["members", "reader"],
    queryFn: () => api(routes.members, { query: { limit: 100 } }),
    retry: false,
  });
  const remove = useMutation({
    mutationFn: () => api(routes.purge, { params: { id } }),
    onSuccess: () => {
      void client.invalidateQueries();
      void navigate({ to: "/" });
    },
  });
  const show = (next: Window) =>
    void navigate({ to: "/sessions/$id", params: { id }, search: next });
  const messages = query.data?.pages.flatMap((item) => item.messages) ?? [];
  const session = query.data?.pages[0]?.session;

  // The pinned bar repeats the page header's identity, so it only earns its space
  // once that header has scrolled away.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    // Without an observer the safe default is the always-visible bar.
    if (typeof IntersectionObserver !== "function") return setPinned(true);
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry?.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [session]);
  useEffect(() => {
    didInitialScroll.current = false;
  }, [id, reload, state.around, state.from, state.kind, state.to]);
  useEffect(() => {
    if (!restoreScroll.current) return;
    const { height, top } = restoreScroll.current;
    restoreScroll.current = null;
    window.scrollTo({ top: top + document.documentElement.scrollHeight - height });
  }, [messages.length]);
  useEffect(() => {
    if (didInitialScroll.current || !messages.length || state.around) return;
    didInitialScroll.current = true;
    requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  }, [id, messages.length, reload, state.around, state.from, state.kind, state.to]);
  useEffect(() => {
    const windowId = `${id}:${state.kind ?? "all"}:${state.around ?? ""}:${reload}`;
    if (
      !state.around ||
      scrolledAround.current === windowId ||
      !messages.some((message) => message.seq === state.around)
    )
      return;
    scrolledAround.current = windowId;
    requestAnimationFrame(() =>
      document.getElementById(`message-${state.around}`)?.scrollIntoView({ block: "center" }),
    );
  }, [id, messages.length, reload, state.around, state.kind]);

  if (query.isPending)
    return (
      <main className={page}>
        <Loading label="Loading session…" />
      </main>
    );
  if (query.isError)
    return (
      <main className={page}>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </main>
    );
  if (!session)
    return (
      <main className={page}>
        <Loading label="Loading session…" />
      </main>
    );
  const panelContent = <AgentPanel session={session} agents={children.data?.items ?? []} />;
  const hiddenDeepLink =
    state.around && state.kind && !messages.some((message) => message.seq === state.around);
  const author =
    session.owner_user_id === org.data?.userId
      ? "You"
      : (members.data?.items.find((member) => member.userId === session.owner_user_id)?.name ??
        "Session author");
  const jumpLatest = () => {
    changes.clear();
    setReload((value) => value + 1);
    show({ kind: state.kind });
  };
  return (
    <main className={page}>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Sessions
      </Link>
      <PageHeader
        className="border-b border-border pb-6"
        eyebrow={session.remote}
        title={session.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <HarnessBadge source={session.source} />
            <span className="font-mono text-xs">{session.branch || "No branch"}</span>
            <SessionActivity session={session} />
            {session.parent_session_id && (
              <span className="rounded-md border border-dotted border-muted px-1.5 py-0.5 text-xs">
                Subagent session, depth {session.spawn_depth || 1}
              </span>
            )}
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void navigator.clipboard.writeText(window.location.href)}
          >
            <Copy /> Copy link
          </Button>
          {!pinned && (
            <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setPanel(true)}>
              <PanelRight /> Context
            </Button>
          )}
          {session.owner_user_id === org.data?.userId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{session.title}” and its descendants will be permanently deleted. Delayed uploads
                  cannot restore them.
                </AlertDialogDescription>
                {remove.isError && <ErrorState error={remove.error} />}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={remove.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      remove.mutate();
                    }}
                  >
                    {remove.isPending ? "Deleting…" : "Delete session"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </PageHeader>
      <div ref={sentinel} aria-hidden="true" />
      {pinned && (
        <section
          aria-label="Session identity"
          className="sticky top-0 z-20 -mx-5 mb-6 flex min-h-11 items-center gap-3 border-y border-border bg-background/95 px-5 py-2 shadow-sm backdrop-blur-sm md:-mx-12 md:px-12"
        >
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">{session.title}</h2>
            <div className="flex items-center gap-2 text-xs text-muted">
              <HarnessBadge source={session.source} />
              <span className="truncate font-mono">{session.branch || "No branch"}</span>
              <span className="hidden sm:inline">
                <SessionActivity session={session} />
              </span>
            </div>
          </div>
          {(changes.changed || state.around || state.from || state.to) && (
            <Button size="sm" onClick={jumpLatest}>
              <ArrowDown aria-hidden="true" className="size-3.5" />
              Jump to latest
            </Button>
          )}
          <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setPanel(true)}>
            <PanelRight /> Context
          </Button>
        </section>
      )}
      <Sheet open={panel} onOpenChange={setPanel}>
        <SheetContent side="right" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Session context and agents</SheetTitle>
          {panelContent}
        </SheetContent>
      </Sheet>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <section className="min-w-0">
          {session.summary && (
            <aside className="mb-6 rounded-lg border border-border bg-surface p-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">
                Current summary
              </h2>
              <p className="text-sm leading-relaxed text-muted">{session.summary}</p>
            </aside>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 text-xs text-muted">
            <span>
              {session.messageCount} messages ·{" "}
              {session.tokens ? `${number(session.tokens.output)} output tokens` : "Usage unknown"}
            </span>
            <label className="flex items-center gap-2">
              Show
              <Select
                value={state.kind ?? "all"}
                onValueChange={(value) =>
                  show({ ...state, kind: value === "all" ? undefined : (value as Window["kind"]) })
                }
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Message kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All messages</SelectItem>
                  <SelectItem value="prompt">Prompts only</SelectItem>
                  <SelectItem value="tool_call">Tool calls only</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          {hiddenDeepLink && (
            <div className="mb-4 rounded-md border border-border bg-surface p-4 text-sm text-muted">
              This filter may hide the linked message.{" "}
              <Button
                variant="link"
                size="none"
                onClick={() => show({ ...state, kind: undefined })}
              >
                Clear filter
              </Button>
            </div>
          )}
          {query.hasPreviousPage && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-3"
              disabled={query.isFetchingPreviousPage}
              onClick={() => {
                restoreScroll.current = {
                  height: document.documentElement.scrollHeight,
                  top: window.scrollY,
                };
                void query.fetchPreviousPage();
              }}
            >
              {query.isFetchingPreviousPage ? "Loading older messages…" : "Load older messages"}
            </Button>
          )}
          <div className="max-w-[72ch]">
            <Transcript
              messages={messages}
              source={session.source}
              promptAuthor={author}
              around={state.around}
            />
          </div>
          {!messages.length && (
            <p className="py-12 text-center text-sm text-muted">No messages in this window.</p>
          )}
        </section>
        <aside className="sticky top-20 hidden self-start lg:block">{panelContent}</aside>
      </div>
    </main>
  );
}
