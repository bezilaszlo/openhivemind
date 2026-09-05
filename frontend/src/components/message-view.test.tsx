// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MessageView } from "./message-view";
afterEach(cleanup);
it("renders untrusted markdown without loading images or executing HTML", () => {
  const { container } = render(
    <MessageView
      source="claude-code"
      message={{
        seq: 1,
        rev: 1,
        kind: "reply",
        text: "Hello **team**\n\n![remote](https://example.test/pixel.png)\n\n<script>alert(1)</script>",
        ts: "2026-09-05T10:00:00Z",
      }}
    />,
  );
  expect(screen.getByText("team").tagName).toBe("STRONG");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByRole("link", { name: "Image: remote" }).getAttribute("href")).toBe(
    "https://example.test/pixel.png",
  );
});
it("keeps tool input collapsed until requested and labels bounded excerpts", () => {
  const { container } = render(
    <MessageView
      source="codex"
      message={{
        seq: 2,
        rev: 1,
        kind: "tool_call",
        tool_name: "Bash",
        text: "pnpm test",
        truncated: true,
        ts: "2026-09-05T10:00:00Z",
      }}
    />,
  );
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  fireEvent.click(container.querySelector("summary")!);
  expect(details.open).toBe(true);
  expect(screen.getByText("Continuation or bounded excerpt")).toBeTruthy();
});
it("tints a prompt with its own harness and leaves replies neutral", () => {
  const { container, rerender } = render(
    <MessageView
      source="opencode"
      message={{ seq: 3, rev: 1, kind: "prompt", text: "Why?", ts: "2026-09-05T10:00:00Z" }}
    />,
  );
  const prompt = container.querySelector("article")!;
  expect(prompt.dataset.harness).toBe("opencode");
  expect(prompt.className).toContain("bg-harness/8");
  rerender(
    <MessageView
      source="opencode"
      message={{ seq: 4, rev: 1, kind: "reply", text: "Because.", ts: "2026-09-05T10:00:00Z" }}
    />,
  );
  const reply = container.querySelector("article")!;
  expect(reply.className).not.toContain("bg-harness");
});
it("labels a fenced code block with its language and offers a copy action", () => {
  render(
    <MessageView
      source="claude-code"
      message={{
        seq: 5,
        rev: 1,
        kind: "reply",
        text: "```sql\nSELECT 1;\n```",
        ts: "2026-09-05T10:00:00Z",
      }}
    />,
  );
  expect(screen.getByText("sql")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(screen.getByText("SELECT 1;")).toBeTruthy();
});
