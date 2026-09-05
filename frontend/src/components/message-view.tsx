import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@openhivemind/shared";
import { harness } from "../lib/harness";
import { harnessProps } from "./harness-badge";
import { cn } from "../lib/utils";
const speaker = {
  prompt: "You",
  reply: "Assistant",
  summary: "Compaction summary",
  tool_call: "Tool call",
} as const;
export function MessageView({ message, source }: { message: Message; source: string }) {
  const { Glyph } = harness(source);
  const isPrompt = message.kind === "prompt";
  return (
    <article
      id={"message-" + message.seq}
      {...harnessProps(source)}
      className={cn(
        "scroll-mt-6",
        isPrompt && "my-3 rounded-r-md border-l-2 border-harness/45 bg-harness/8 px-5 py-4",
        message.kind === "reply" && "border-t border-border px-1 py-6",
        message.kind === "summary" &&
          "my-3 rounded-md border border-border bg-surface px-5 py-4 text-sm",
        message.kind === "tool_call" && "border-t border-border px-1 py-3",
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className={cn("font-semibold", isPrompt ? "text-harness" : "text-foreground")}>
          {speaker[message.kind]}
        </span>
        <a className="hover:text-foreground" href={"#message-" + message.seq}>
          #{message.seq}
        </a>
        {message.model && <span className="font-mono">{message.model}</span>}
      </header>
      {message.kind === "tool_call" ? (
        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-harness/30 bg-harness/8 px-2.5 py-1 font-mono text-xs text-harness">
            <Glyph className="size-3.5" />
            {message.tool_name ?? "Tool"}
            <span className="font-sans text-muted">Input only</span>
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-sidebar p-4 font-mono text-xs leading-relaxed">
            {message.text}
          </pre>
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
      {message.truncated && (
        <p className="mt-3 text-xs text-muted">Continuation or bounded excerpt</p>
      )}
    </article>
  );
}
