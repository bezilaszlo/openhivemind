import { expect, it } from "vitest";
import { createApi, routes } from "@openhivemind/shared";
import { demoTransport } from "./demo";
const api = createApi("http://demo.test", undefined, demoTransport);
it("provides contract-valid data for every preview screen", async () => {
  const sessions = await api(routes.sessions);
  expect(sessions.items.length).toBeGreaterThan(5);
  const reader = await api(routes.session, { params: { id: sessions.items[0]!.id } });
  expect(reader.messages.some((message) => message.kind === "tool_call")).toBe(true);
  expect((await api(routes.search, { body: { query: "webhook" } })).items.length).toBeGreaterThan(
    0,
  );
  expect((await api(routes.usage)).totals?.input).toBeGreaterThan(0);
  expect((await api(routes.tokens)).items).toHaveLength(1);
  expect((await api(routes.members)).items).toHaveLength(3);
  expect((await api(routes.org)).role).toBe("admin");
});
it("filters the preview and reports invalid regex as a failure", async () => {
  expect(
    (await api(routes.sessions, { query: { mine: true } })).items.every(
      (session) => session.owner_user_id === "demo-user",
    ),
  ).toBe(true);
  await expect(api(routes.search, { body: { query: "[", regex: true } })).rejects.toThrow(
    "Invalid regex",
  );
});
