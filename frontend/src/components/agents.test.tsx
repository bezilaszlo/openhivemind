// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Agents, Session } from "@openhivemind/shared";
import { renderScreen } from "../test-utils";
import { AgentList, AgentsCell, depthGroups, shortModel } from "./agents";
afterEach(cleanup);
const session = (agents: Agents | null): Session =>
  ({
    id: "root",
    source: "claude-code",
    models: ["claude-opus-5"],
    agents,
  }) as unknown as Session;
const rollup = (over: Partial<Agents>): Agents => ({
  count: 2,
  maxDepth: 1,
  models: [{ model: "claude-opus-5", count: 2, inherited: 2 }],
  inputTokens: 100,
  outputTokens: 20,
  ...over,
});
it("says a session without subagents is a main session", () => {
  render(<AgentsCell session={session(null)} />);
  expect(screen.getByText("Main session")).toBeTruthy();
  expect(screen.queryByText(/deep/)).toBeNull();
});
it("shows the models a flat set of subagents ran and marks inherited ones", () => {
  const { container } = render(<AgentsCell session={session(rollup({}))} />);
  expect(screen.getByText("2 agents")).toBeTruthy();
  const chips = [...container.querySelectorAll("[data-inherited]")] as HTMLElement[];
  expect(chips).toHaveLength(1);
  expect(chips[0]!.dataset.inherited).toBe("all");
  expect(chips[0]!.title).toBe("Inherited the session model");
  expect(screen.getByText("×2")).toBeTruthy();
  expect(screen.queryByText(/deep/)).toBeNull();
});
it("counts partly inherited models and flags nesting", () => {
  const { container } = render(
    <AgentsCell
      session={session(
        rollup({
          count: 3,
          maxDepth: 2,
          models: [{ model: "claude-opus-5", count: 3, inherited: 1 }],
        }),
      )}
    />,
  );
  const chip = container.querySelector("[data-inherited]") as HTMLElement;
  expect(chip.dataset.inherited).toBe("some");
  expect(screen.getByText("~1")).toBeTruthy();
  const marker = screen.getByText("2 deep");
  expect(marker.title).toBe("A subagent spawned its own subagents");
});
it("groups children by the depth the harness spawned them at", async () => {
  const child = (id: string, spawn_depth: number) =>
    ({
      id,
      title: id,
      source: "claude-code",
      spawn_depth,
      models: ["claude-opus-5"],
      messageCount: 4,
      tokens: { input: 10, output: 2, cache_read: 0, cache_creation: 0 },
    }) as unknown as Session;
  const children = [child("a", 1), child("b", 2), child("c", 1)];
  expect(depthGroups(children).map(({ depth, group }) => [depth, group.length])).toEqual([
    [1, 2],
    [2, 1],
  ]);
  renderScreen(() => <AgentList sessions={children} />);
  expect(await screen.findByText("Depth 1")).toBeTruthy();
  expect(screen.getByText("Depth 2")).toBeTruthy();
  expect(screen.getAllByText("↳")).toHaveLength(2);
  expect(screen.getAllByText("↳↳")).toHaveLength(1);
});
it("drops the vendor prefix from a model name", () => {
  expect(shortModel("claude-sonnet-4-6")).toBe("sonnet-4-6");
  expect(shortModel("gpt-5.4")).toBe("gpt-5.4");
});
