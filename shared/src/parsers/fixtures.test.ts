import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { parseRecords } from "./index";
it.each(["claude-code", "codex", "opencode"] as const)(
  "normalizes the scrubbed %s discovery capture",
  async (source) => {
    const folder = new URL(`../../../fixtures/${source}/`, import.meta.url);
    const input = JSON.parse(await readFile(new URL("session.json", folder), "utf8")) as unknown[];
    const golden = JSON.parse(await readFile(new URL("golden.json", folder), "utf8"));
    expect(parseRecords(source, input)).toEqual(golden);
  },
);

it("matches the independently recorded Codex provider totals", async () => {
  const input = JSON.parse(
    await readFile(new URL("../../../fixtures/codex/session.json", import.meta.url), "utf8"),
  );
  const messages = parseRecords("codex", input).messages;
  expect(
    messages.reduce(
      (sum, message) => sum + (message.usage?.input ?? 0) + (message.usage?.cache_read ?? 0),
      0,
    ),
  ).toBe(45922);
  expect(messages.reduce((sum, message) => sum + (message.usage?.output ?? 0), 0)).toBe(117);
});
