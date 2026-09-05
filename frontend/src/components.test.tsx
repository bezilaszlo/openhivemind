// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MessageView } from "./components";
afterEach(cleanup);
it("renders untrusted markdown without loading images or executing HTML", () => {
  const { container } = render(
    <MessageView
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
