import type { ButtonHTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { routes, ApiError, type Session, type Message } from "@openhivemind/shared";
import { api } from "./api";
export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={"button " + className} {...props} />;
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "The request failed";
  return (
    <div className="notice error" role="alert">
      <p>{message}</p>
      {error instanceof ApiError && error.status === 401 ? (
        <Link to="/login">Sign in</Link>
      ) : retry ? (
        <Button onClick={retry}>Try again</Button>
      ) : null}
    </div>
  );
}
export function Loading() {
  return (
    <div className="notice" role="status">
      Loading…
    </div>
  );
}
export const number = (value: number | undefined | null) =>
  value == null ? "Unknown" : new Intl.NumberFormat().format(value);
export const time = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export function useOrg() {
  return useQuery({ queryKey: ["org"], queryFn: () => api(routes.org), retry: false });
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function SessionRow({ session }: { session: Session }) {
  return (
    <article className="session-row">
      <div className="session-title">
        <Link to="/sessions/$id" params={{ id: session.id }}>
          {session.title || "Untitled session"}
        </Link>
        <span className="badge">{session.source}</span>
      </div>
      <p className="preview">
        {session.lastPrompt ?? session.lastReply ?? "No messages captured yet"}
      </p>
      <div className="metadata">
        <span>{session.remote}</span>
        <span>{session.branch || "No branch"}</span>
        <span>{time(session.last_activity_at)}</span>
        <span>{session.childCount ? `${session.childCount} agents` : "Main session"}</span>
        <span>
          {session.tokens
            ? `${number(session.tokens.input + session.tokens.output + session.tokens.cache_read + session.tokens.cache_creation)} tokens`
            : "Usage unknown"}
        </span>
      </div>
      <ChevronRight className="row-arrow" size={18} />
    </article>
  );
}

export function MessageView({ message }: { message: Message }) {
  return (
    <article id={"message-" + message.seq} className={"message " + message.kind}>
      <header>
        <span>
          {message.kind === "prompt"
            ? "You"
            : message.kind === "reply"
              ? "Assistant"
              : message.kind === "summary"
                ? "Compaction summary"
                : "Tool call"}
        </span>
        <a href={"#message-" + message.seq}>#{message.seq}</a>
        <span>{message.model}</span>
      </header>
      {message.kind === "tool_call" ? (
        <details>
          <summary>
            {message.tool_name ?? "Tool"} <span className="muted">View input</span>
          </summary>
          <pre>{message.text}</pre>
        </details>
      ) : (
        <div className="prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => (
                <a href={src} rel="noreferrer">
                  Image: {alt || "remote image"}
                </a>
              ),
              a: ({ children, ...props }) => (
                <a {...props} rel="noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {message.text}
          </Markdown>
        </div>
      )}
      {message.truncated && <p className="muted continuation">Continuation or bounded excerpt</p>}
    </article>
  );
}
