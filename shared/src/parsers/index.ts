import type { Message, Meta } from "../schemas/index";
import { toolSummary, scrub } from "../privacy/index";
type RecordValue = Record<string, unknown>;
export const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
// Claude Code stamps a whole user record `isMeta: true` for a local-command caveat, and
// that record is dropped entirely below (see the isMeta check), never reaching here. A
// `/command` echo is not flagged isMeta (measured across real transcripts: the caveat is
// isMeta 47/47, the echo 1/51) and its three tags appear in either order with
// `command-args` sometimes absent, so each tag is matched independently rather than as one
// fixed sequence. A `system-reminder` is different again: it is stapled onto a record that
// still carries the developer's own typed text (memory recalls, hook output), so every
// wrapper form here is stripped wherever it occurs in the block, not just at a leading
// position, and the record is dropped only if nothing real remains after trimming.
const INJECTED_WRAPPER =
  /<system-reminder>[\s\S]*?<\/system-reminder>|<command-name>[\s\S]*?<\/command-name>|<command-message>[\s\S]*?<\/command-message>|<command-args>[\s\S]*?<\/command-args>/g;
function stripInjectedPrompt(text: string): string {
  return text.replace(INJECTED_WRAPPER, "").trim();
}
export type ParsedMessage = Omit<Message, "seq" | "rev"> & { source_event_id: string };
export interface Parsed {
  messages: ParsedMessage[];
  meta: Partial<Meta>;
  state: { model?: string; seenUsage: string[]; start?: number };
}
export function parseRecords(
  source: Meta["source"],
  rows: readonly unknown[],
  previous?: {
    messages: ParsedMessage[];
    model?: string;
    seenUsage: string[];
    indexOffset: number;
    start?: number;
  },
): Parsed {
  const messages: ParsedMessage[] = previous?.messages.map((message) => ({ ...message })) ?? [];
  const meta: Partial<Meta> = {};
  let model: string | undefined = previous?.model;
  // Carried in capture state: the inherited prefix of a child rollout can outlast one read window.
  let codexStart = previous?.start ?? 0;
  const usageSeen = new Set<string>(previous?.seenUsage);
  rows.forEach((row, index) => {
    const data = record(row),
      payload = record(data.payload),
      message = record(data.message);
    const ts = str(
      data.timestamp,
      typeof data.created_at === "number"
        ? new Date(data.created_at).toISOString()
        : "1970-01-01T00:00:00.000Z",
    );
    const id = str(
      data.uuid,
      str(data.id, `${source}:${data.ordinal ?? index + (previous?.indexOffset ?? 0)}`),
    );
    const branch = str(data.gitBranch);
    function emit(
      kind: Message["kind"],
      text: string,
      suffix: string,
      tool_name?: string,
    ): ParsedMessage {
      const item: ParsedMessage = {
        kind,
        text: scrub(text),
        ts,
        source_event_id: `${id}:${suffix}`,
        ...(branch ? { branch: scrub(branch) } : {}),
        ...(model ? { model: scrub(model) } : {}),
        ...(tool_name ? { tool_name: scrub(tool_name) } : {}),
      };
      messages.push(item);
      return item;
    }
    if (source === "claude-code") {
      if (data.cwd) meta.cwd = str(data.cwd);
      if (data.version) meta.version = str(data.version);
      if (branch) meta.branch = branch;
      // Claude writes its resume-menu title as a separate record, after the conversation may
      // already have been captured. It is metadata, never a chat message.
      if (data.type === "ai-title") {
        const title = str(data.aiTitle, str(payload.aiTitle));
        if (title.trim()) meta.title = title;
        return;
      }
      if (data.type !== "user" && data.type !== "assistant") return;
      if (data.type === "user" && data.isMeta) return;
      model = str(message.model) || model;
      const kind = data.isCompactSummary ? "summary" : data.type === "user" ? "prompt" : "reply";
      const clean = (text: string) => (kind === "prompt" ? stripInjectedPrompt(text) : text);
      const before = messages.length;
      if (typeof message.content === "string") {
        const text = clean(message.content);
        if (text) emit(kind, text, "text");
      } else
        list(message.content).forEach((value, blockIndex) => {
          const block = record(value);
          if (block.type === "text") {
            const text = clean(str(block.text));
            if (text) emit(kind, text, String(blockIndex));
          } else if (block.type === "tool_use")
            emit(
              "tool_call",
              toolSummary(str(block.name), block.input),
              String(blockIndex),
              str(block.name),
            );
        });
      const usage = record(message.usage);
      const responseId = str(message.id, id);
      if (
        data.type === "assistant" &&
        Object.keys(usage).length &&
        messages[before] &&
        !usageSeen.has(responseId)
      ) {
        messages[before]!.usage = {
          input: num(usage.input_tokens),
          output: num(usage.output_tokens),
          cache_read: num(usage.cache_read_input_tokens),
          cache_creation: num(usage.cache_creation_input_tokens),
        };
        usageSeen.add(responseId);
      }
    } else if (source === "codex") {
      // A subagent rollout starts with the parent's history and session_meta copied in; only
      // records from `subagent_history_start_ordinal` on belong to the child.
      if (typeof data.ordinal === "number" && data.ordinal < codexStart) return;
      if (data.type === "session_meta") {
        if (typeof payload.subagent_history_start_ordinal === "number")
          codexStart = payload.subagent_history_start_ordinal;
        meta.cwd = str(payload.cwd);
        meta.version = str(payload.cli_version);
        meta.branch = str(record(payload.git).branch);
        const parent = payload.parent_thread_id ?? payload.forked_from_id ?? payload.session_id;
        if (typeof parent === "string" && parent !== payload.id) meta.parent_external_id = parent;
        return;
      }
      if (data.type === "turn_context") {
        model = str(payload.model) || model;
        return;
      }
      if (data.type === "compacted") {
        emit("summary", str(payload.message), "summary");
        return;
      }
      if (data.type === "token_usage_record") {
        const usage = record(payload.usage);
        const responseId = str(payload.response_id, id);
        const target = [...messages]
          .reverse()
          .find((item) => (item.kind === "reply" || item.kind === "tool_call") && !item.usage);
        if (target && !usageSeen.has(responseId)) {
          target.usage = {
            input: Math.max(0, num(usage.input_tokens) - num(usage.cached_input_tokens)),
            output: num(usage.output_tokens),
            cache_read: num(usage.cached_input_tokens),
            cache_creation: num(usage.cache_write_input_tokens),
          };
          usageSeen.add(responseId);
        }
        return;
      }
      if (data.type !== "response_item") return;
      if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant")) {
        // Codex opens a thread with AGENTS.md, skills, plugin and environment context as user
        // messages; `content_item_kinds` marks which block the developer actually typed. Once
        // that array exists every block has to earn its place, including one past its end.
        const labels = record(
          payload.internal_chat_message_metadata_passthrough,
        ).content_item_kinds;
        const kinds = Array.isArray(labels) ? labels : undefined;
        list(payload.content).forEach((value, blockIndex) => {
          const block = record(value);
          if (payload.role === "user" && kinds && kinds[blockIndex] !== "user.text") return;
          if (block.type === "input_text" || block.type === "output_text")
            emit(payload.role === "user" ? "prompt" : "reply", str(block.text), String(blockIndex));
        });
      }
      if (payload.type === "function_call" || payload.type === "custom_tool_call")
        emit(
          "tool_call",
          toolSummary(str(payload.name), payload.arguments ?? payload.input),
          "tool",
          str(payload.name),
        );
    } else {
      const info = record(data.info ?? data);
      model = str(info.modelID, str(record(info.model).modelID)) || model;
      const before = messages.length;
      list(data.parts).forEach((value, blockIndex) => {
        const part = record(value);
        const suffix = str(part.id, String(blockIndex));
        if (part.type === "text")
          emit(
            info.summary === true ? "summary" : info.role === "user" ? "prompt" : "reply",
            str(part.text),
            suffix,
          );
        if (part.type === "tool")
          emit(
            "tool_call",
            toolSummary(str(part.tool), record(part.state).input),
            suffix,
            str(part.tool),
          );
      });
      const usage = record(info.tokens);
      const cache = record(usage.cache);
      if (info.role === "assistant" && Object.keys(usage).length && messages[before])
        messages[before]!.usage = {
          input: num(usage.input),
          output: num(usage.output),
          cache_read: num(cache.read),
          cache_creation: num(cache.write),
        };
    }
  });
  return {
    messages,
    meta,
    state: {
      ...(model ? { model } : {}),
      ...(codexStart ? { start: codexStart } : {}),
      seenUsage: [...usageSeen],
    },
  };
}
