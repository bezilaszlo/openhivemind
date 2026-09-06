import { expect, it } from "vitest";
import { createServer } from "node:http";
import type pg from "pg";
import { buildApp } from "./app";
import { createAuth } from "./auth/index";
import { handlers } from "./services";
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
it("derives /api/v1/config providers from the real auth configuration, not a hardcoded list", async () => {
  // A real (if minimal) discovery document, so better-auth's OIDC plugin initializes instead of
  // rejecting in the background against a fake issuer.
  let issuer = "";
  const discovery = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: issuer + "/authorize",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      }),
    );
  });
  await new Promise<void>((resolve) => discovery.listen(0, "127.0.0.1", resolve));
  const address = discovery.address();
  issuer = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "";
  try {
    const url = "http://localhost:3000";
    const auth = createAuth({} as pg.Pool, {
      url,
      secret: "test-only-config-provider-secret-0000001",
      oidc: { issuer, clientId: "id", clientSecret: "secret" },
    });
    const app = await buildApp({ url, handlers: handlers({} as pg.Pool, auth, url) });
    try {
      expect((await app.inject("/api/v1/config")).json().providers).toEqual(["local", "oidc"]);
    } finally {
      await app.close();
    }
  } finally {
    discovery.close();
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
