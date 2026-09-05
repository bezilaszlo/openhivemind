import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, PanelRight, Trash2 } from "lucide-react";
import { routes } from "@openhivemind/shared";
import { api } from "../api";
import { number } from "../lib/format";
import { useChanges } from "../lib/changes";
import { AgentPanel } from "../components/agent-panel";
import { SessionActivity } from "../components/activity";
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../components/ui/sheet";
type Window = { around?: number; kind?: "prompt" | "tool_call"; from?: number };
export function Reader({ id }: { id: string }) {
  const state = useSearch({ strict: false }) as Window;
  const navigate = useNavigate();
  const org = useOrg();
  const client = useQueryClient();
  const [panel, setPanel] = useState(false);
  const changes = useChanges(id);
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
  const show = (next: Window) =>
    void navigate({ to: "/sessions/$id", params: { id }, search: next });
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
  const { session, messages } = query.data;
  const panelContent = <AgentPanel session={session} agents={children.data?.items ?? []} />;
  const hiddenDeepLink =
    state.around && state.kind && !messages.some((message) => message.seq === state.around);
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
          <Sheet open={panel} onOpenChange={setPanel}>
            <SheetTrigger asChild>
              <Button size="sm" className="lg:hidden">
                <PanelRight /> Context
              </Button>
            </SheetTrigger>
            <SheetContent side="right" aria-describedby={undefined}>
              <SheetTitle className="sr-only">Session context and agents</SheetTitle>
              {panelContent}
            </SheetContent>
          </Sheet>
        </div>
      </PageHeader>
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
          {changes.changed && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3 text-sm text-muted">
              This session has new messages.
              <Button
                size="sm"
                onClick={() => {
                  changes.clear();
                  void query.refetch();
                }}
              >
                Load them
              </Button>
            </div>
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
          <div className="max-w-[72ch]">
            {messages.map((message) => (
              <MessageView key={message.seq} message={message} source={session.source} />
            ))}
          </div>
          {!messages.length && (
            <p className="py-12 text-center text-sm text-muted">No messages in this window.</p>
          )}
          {query.data.cursor && (
            <Button
              className="mt-6"
              onClick={() => show({ from: (messages.at(-1)?.seq ?? 0) + 1, kind: state.kind })}
            >
              Load next window
            </Button>
          )}
        </section>
        <aside className="hidden lg:block">{panelContent}</aside>
      </div>
    </main>
  );
}
