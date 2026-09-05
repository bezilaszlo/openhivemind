// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./theme-toggle";
let prefersDark = false;
beforeEach(() => {
  localStorage.clear();
  prefersDark = false;
  window.matchMedia = ((query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);
it("persists an explicit override and applies it to the document", () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
  expect(localStorage.getItem("openhivemind-theme")).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Light theme" }));
  expect(localStorage.getItem("openhivemind-theme")).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});
it("keeps system as its own choice and follows the system preference", () => {
  localStorage.setItem("openhivemind-theme", "dark");
  prefersDark = true;
  render(<ThemeToggle />);
  expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "System theme" }));
  expect(localStorage.getItem("openhivemind-theme")).toBe("system");
  expect(document.documentElement.dataset.theme).toBe("dark");
  prefersDark = false;
  cleanup();
  render(<ThemeToggle />);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(screen.getByRole("button", { name: "System theme" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});
