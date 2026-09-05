import { expect, it } from "vitest";
import { parseRecords } from "./index";
it("drops thinking and tool results and counts one provider response once", () => {
  const message = {
    id: "response-1",
    content: [
      { type: "thinking", thinking: "private" },
      { type: "text", text: "answer" },
      { type: "tool_use", name: "bash", input: { command: "cat .env" } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
  const result = parseRecords("claude-code", [
    { type: "assistant", uuid: "a", message },
    { type: "assistant", uuid: "b", message },
    { type: "user", message: { content: [{ type: "tool_result", content: "private" }] } },
  ]);
  expect(result.messages.map((item) => item.text)).toEqual([
    "answer",
    "bash [redacted]",
    "answer",
    "bash [redacted]",
  ]);
  expect(result.messages.filter((item) => item.usage)).toHaveLength(1);
});
it("subtracts cached Codex input and excludes outputs", () => {
  const result = parseRecords("codex", [
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "done" }],
      },
    },
    { type: "response_item", payload: { type: "function_call_output", output: "private" } },
    {
      type: "token_usage_record",
      payload: {
        turn_id: "t",
        usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 5 },
      },
    },
  ]);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]?.usage).toEqual({
    input: 60,
    cache_read: 40,
    output: 5,
    cache_creation: 0,
  });
});
it("reads opencode text and summaries without tool output", () => {
  const result = parseRecords("opencode", [
    {
      id: "m",
      info: {
        role: "assistant",
        summary: true,
        tokens: { input: 3, output: 4, cache: { read: 5, write: 6 } },
      },
      parts: [
        { id: "p", type: "text", text: "summary" },
        { id: "q", type: "tool", tool: "bash", state: { input: "pwd", output: "private" } },
        { type: "reasoning", text: "private" },
      ],
    },
  ]);
  expect(result.messages.map((item) => item.kind)).toEqual(["summary", "tool_call"]);
  expect(result.messages[0]?.usage?.cache_creation).toBe(6);
  expect(JSON.stringify(result)).not.toContain("private");
});
