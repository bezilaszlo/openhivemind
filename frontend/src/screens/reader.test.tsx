// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { routes, type Session } from "@openhivemind/shared";
import { renderScreen } from "../test-utils";
import { Reader } from "./reader";
const mock = vi.hoisted(() => ({ api: vi.fn(), purge: vi.fn() }));
vi.mock("../api", () => ({ api: (...args: unknown[]) => mock.api(...args), isDemo: false }));
const session = {
  id: "s1",
  owner_user_id: "me",
  source: "claude-code",
  remote: "github.com/team/app",
  branch: "main",
  title: "Fix duplicate deliveries",
  models: ["claude-sonnet-4-6"],
  started_at: "2026-09-05T09:00:00Z",
  last_activity_at: "2026-09-05T10:00:00Z",
  completed: true,
  parent_session_id: null,
  messageCount: 1,
  childCount: 0,
  tokens: null,
  summary: null,
} as unknown as Session;
beforeEach(() => {
  mock.api.mockClear();
  mock.purge.mockClear();
  mock.api.mockImplementation((route: unknown) => {
    if (route === routes.org)
      return Promise.resolve({ id: "o", name: "Team", userId: "me", role: "admin" });
    if (route === routes.session)
      return Promise.resolve({
        session,
        messages: [
          { seq: 1, rev: 1, kind: "prompt", text: "Trace the retry path", ts: session.started_at },
        ],
        cursor: null,
      });
    if (route === routes.purge) return mock.purge();
    return Promise.resolve({ items: [], cursor: null });
  });
});
afterEach(cleanup);
async function openDialog() {
  renderScreen(() => <Reader id="s1" />);
  const trigger = await screen.findByRole("button", { name: /Delete/ });
  fireEvent.click(trigger);
  expect(await screen.findByRole("alertdialog")).toBeTruthy();
  return trigger;
}
it("cancels a delete without calling the API and returns focus to the trigger", async () => {
  const trigger = await openDialog();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mock.purge).not.toHaveBeenCalled();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("names the session and purges its descendants only on confirmation", async () => {
  mock.purge.mockResolvedValue({ deleted: 2 });
  await openDialog();
  expect(screen.getByText(/its descendants will be permanently deleted/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete session" }));
  await waitFor(() => expect(mock.purge).toHaveBeenCalledTimes(1));
});
