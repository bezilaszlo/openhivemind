// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { activityOf, SessionActivity } from "./activity";
afterEach(cleanup);
const session = (minutesAgo: number, completed: boolean) => ({
  source: "claude-code" as const,
  completed,
  last_activity_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
});
it("marks an open session with recent capture as active, with a hued dot", () => {
  const { container } = render(<SessionActivity session={session(2, false)} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.dataset.activity).toBe("active");
  expect(root.dataset.harness).toBe("claude-code");
  const dot = container.querySelector("[data-slot=activity-dot]")!;
  expect(dot.getAttribute("aria-hidden")).toBe("true");
  expect(dot.querySelector(".bg-harness")).not.toBeNull();
  expect(screen.getByText(/^active /)).toBeTruthy();
});
it("drops the dot and shows a plain relative time once capture goes quiet", () => {
  const { container } = render(<SessionActivity session={session(45, false)} />);
  expect((container.firstElementChild as HTMLElement).dataset.activity).toBe("idle");
  expect(container.querySelector("[data-slot=activity-dot]")).toBeNull();
  expect(screen.queryByText(/active/)).toBeNull();
  expect(screen.queryByText(/running|live/i)).toBeNull();
});
it("says ended for a completed session, however recent", () => {
  const { container } = render(<SessionActivity session={session(1, true)} />);
  expect((container.firstElementChild as HTMLElement).dataset.activity).toBe("ended");
  expect(container.querySelector("[data-slot=activity-dot]")).toBeNull();
  expect(screen.getByText(/^ended /)).toBeTruthy();
});
it("keeps the ten minute boundary", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  const at = (minutes: number) => ({
    completed: false,
    last_activity_at: new Date(now - minutes * 60000).toISOString(),
  });
  expect(activityOf(at(9), now)).toBe("active");
  expect(activityOf(at(11), now)).toBe("idle");
  expect(activityOf({ ...at(0), completed: true }, now)).toBe("ended");
});
