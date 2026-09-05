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
export type ParsedMessage = Omit<Message, "seq" | "rev"> & { source_event_id: string };
export interface Parsed {
  messages: ParsedMessage[];
  meta: Partial<Meta>;
}
export function parseRecords(source: Meta["source"], rows: readonly unknown[]): Parsed {
  const messages: ParsedMessage[] = [];
  const meta: Partial<Meta> = {};
  let model: string | undefined;
  const usageSeen = new Set<string>();
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
    const id = str(data.uuid, str(data.id, `${source}:${data.ordinal ?? index}`));
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
      if (data.type !== "user" && data.type !== "assistant") return;
      model = str(message.model) || model;
      const kind = data.isCompactSummary ? "summary" : data.type === "user" ? "prompt" : "reply";
      const before = messages.length;
      if (typeof message.content === "string") emit(kind, message.content, "text");
      else
        list(message.content).forEach((value, blockIndex) => {
          const block = record(value);
          if (block.type === "text") emit(kind, str(block.text), String(blockIndex));
          else if (block.type === "tool_use")
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
      if (data.type === "session_meta") {
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
        const responseId = str(payload.turn_id, id);
        const target = [...messages].reverse().find((item) => item.kind === "reply" && !item.usage);
        if (target && !usageSeen.has(responseId)) {
          target.usage = {
            input: Math.max(0, num(usage.input_tokens) - num(usage.cached_input_tokens)),
            output: num(usage.output_tokens),
            cache_read: num(usage.cached_input_tokens),
            cache_creation: 0,
          };
          usageSeen.add(responseId);
        }
        return;
      }
      if (data.type !== "response_item") return;
      if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant"))
        list(payload.content).forEach((value, blockIndex) => {
          const block = record(value);
          if (block.type === "input_text" || block.type === "output_text")
            emit(payload.role === "user" ? "prompt" : "reply", str(block.text), String(blockIndex));
        });
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
            info.summary ? "summary" : info.role === "user" ? "prompt" : "reply",
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
  return { messages, meta };
}
