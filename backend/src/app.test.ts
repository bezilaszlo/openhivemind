import { expect, it } from "vitest";
import { buildApp } from "./app";
import { createApi, routes } from "@openhivemind/shared";
it("serves schemas and config without a database", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject("/docs/json");
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toContain("/api/v1/ingest/sessions/{externalId}");
    expect((await app.inject("/api/v1/config")).json().protocol.current).toBe(1);
  } finally {
    await app.close();
  }
});
it("validates ingest before invoking a stub", async () => {
  let invoked = false;
  const app = await buildApp({
    handlers: {
      ingest: async () => {
        invoked = true;
        return {};
      },
    },
  });
  try {
    expect(
      (await app.inject({ method: "POST", url: "/api/v1/ingest/sessions/test", payload: {} }))
        .statusCode,
    ).toBe(400);
    expect(invoked).toBe(false);
  } finally {
    await app.close();
  }
});
it("client refuses an invalid response", async () => {
  const api = createApi(
    "http://example.test",
    undefined,
    async () => new Response("{}", { headers: { "content-type": "application/json" } }),
  );
  await expect(api(routes.config)).rejects.toThrow("contract");
});
