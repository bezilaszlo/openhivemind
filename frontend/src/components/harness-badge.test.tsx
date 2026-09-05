// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HarnessBadge, HarnessStripe, harnessProps } from "./harness-badge";
afterEach(cleanup);
it("names each harness and carries its own hue", () => {
  for (const [source, label] of [
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["opencode", "opencode"],
  ] as const) {
    const { container } = render(<HarnessBadge source={source} />);
    const badge = screen.getByText(label).closest("[data-slot=badge]") as HTMLElement;
    expect(badge.dataset.harness).toBe(source);
    expect(container.querySelector("svg")).not.toBeNull();
    cleanup();
  }
});
it("falls back to the muted token for an unknown harness", () => {
  render(<HarnessBadge source="something-else" />);
  const badge = screen.getByText("something-else").closest("[data-slot=badge]") as HTMLElement;
  expect(badge.dataset.harness).toBeUndefined();
  expect(harnessProps("something-else")).toEqual({});
});
it("draws a decorative stripe in the harness hue", () => {
  const { container } = render(<HarnessStripe />);
  const stripe = container.firstElementChild as HTMLElement;
  expect(stripe.getAttribute("aria-hidden")).toBe("true");
  expect(stripe.className).toContain("bg-harness");
});
