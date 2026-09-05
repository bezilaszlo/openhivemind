// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError, type Session } from "@openhivemind/shared";
import { renderScreen } from "../test-utils";
import { SearchPage } from "./search";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../api", () => ({ api: (...args: unknown[]) => mock.api(...args), isDemo: false }));
const session = {
  id: "s1",
  source: "codex",
  remote: "github.com/team/app",
  title: "Move search to full-text indexes",
  last_activity_at: "2026-09-05T10:00:00Z",
} as unknown as Session;
const hit = (snippet: string) => ({
  items: [{ session, score: 1, seq: 4, kind: "reply" as const, snippet, context: [] }],
  cursor: null,
});
afterEach(cleanup);
it("explains an unparseable query instead of showing an empty result", async () => {
  mock.api.mockImplementation(() => Promise.reject(new ApiError(400, "Unclosed quote in query")));
  renderScreen(SearchPage, "/search?q=%22oops", "/search");
  expect(await screen.findByText("That query could not be parsed")).toBeTruthy();
  expect(screen.getByText("Unclosed quote in query")).toBeTruthy();
  expect(screen.queryByText("No matching sessions")).toBeNull();
});
it("offers narrower filters when the search times out", async () => {
  mock.api.mockImplementation(() => Promise.reject(new ApiError(408, "Search timed out")));
  renderScreen(SearchPage, "/search?q=slow", "/search");
  expect(await screen.findByText("The search took too long")).toBeTruthy();
  expect(screen.getByText(/Narrow your filters/)).toBeTruthy();
  expect(screen.queryByText("No matching sessions")).toBeNull();
});
it("says when no session matches", async () => {
  mock.api.mockResolvedValue({ items: [], cursor: null });
  renderScreen(SearchPage, "/search?q=nothing", "/search");
  expect(await screen.findByText("No matching sessions")).toBeTruthy();
});
it("marks results stale instead of wiping them while a new query runs", async () => {
  let release: (value: unknown) => void = () => {};
  mock.api
    .mockResolvedValueOnce(hit("first answer"))
    .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
  renderScreen(SearchPage, "/search?q=first", "/search");
  expect(await screen.findByText("first answer")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "second" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(screen.getByText("Updating results — showing the previous matches")).toBeTruthy(),
  );
  expect(screen.getByText("first answer")).toBeTruthy();
  release(hit("second answer"));
  expect(await screen.findByText("second answer")).toBeTruthy();
});
