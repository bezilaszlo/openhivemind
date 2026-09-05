import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import Fastify from "fastify";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { buildApp } from "../src/app";
import { createAuth } from "../src/auth/index";
import { mountAuth } from "../src/auth/bridge";
import { testDatabase, clearDatabase } from "./database";
const pool = testDatabase();
const issuerApp = Fastify();
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
let issuer = "";
let nonce = "";
let challenge = "";
let subject = "developer-1";
let email = "oidc@example.test";
issuerApp.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_, body, done) => done(null, new URLSearchParams(String(body))),
);
issuerApp.get("/.well-known/openid-configuration", async () => ({
  issuer,
  authorization_endpoint: issuer + "/authorize",
  token_endpoint: issuer + "/token",
  userinfo_endpoint: issuer + "/userinfo",
  jwks_uri: issuer + "/jwks",
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
}));
issuerApp.get("/jwks", async () => ({ keys: [jwk] }));
issuerApp.get("/userinfo", async () => ({
  sub: subject,
  email,
  email_verified: true,
  name: "OIDC developer",
}));
issuerApp.post("/token", async (request, reply) => {
  const body = request.body as URLSearchParams;
  if (
    createHash("sha256")
      .update(body.get("code_verifier") ?? "")
      .digest("base64url") !== challenge
  )
    return reply.code(400).send({ error: "invalid_grant" });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload =
    encode({ alg: "RS256", kid: "test-key" }) +
    "." +
    encode({
      iss: issuer,
      sub: subject,
      aud: "test-client",
      iat: now,
      exp: now + 300,
      nonce,
      email,
      email_verified: true,
      name: "OIDC developer",
    });
  return {
    access_token: "mock-access",
    token_type: "Bearer",
    expires_in: 300,
    id_token:
      payload +
      "." +
      sign("RSA-SHA256", Buffer.from(payload), keys.privateKey).toString("base64url"),
  };
});
const url = "http://localhost:3000";
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  issuer = await issuerApp.listen({ host: "127.0.0.1", port: 0 });
  const auth = createAuth(pool, {
    url,
    secret: "integration-only-not-a-production-secret-0002",
    oidc: { issuer, clientId: "test-client", clientSecret: "test-client-secret" },
  });
  app = await buildApp();
  await mountAuth(app, pool, auth, url);
  await app.ready();
});
beforeEach(() => clearDatabase(pool));
afterAll(async () => {
  await app?.close();
  await issuerApp.close();
  await pool.end();
});
async function login() {
  const start = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/social",
    headers: { origin: url },
    payload: { provider: "oidc", callbackURL: url + "/" },
  });
  expect(start.statusCode, start.body).toBe(200);
  const authorization = new URL(start.json().url);
  nonce = authorization.searchParams.get("nonce") ?? "";
  challenge = authorization.searchParams.get("code_challenge") ?? "";
  expect(nonce).not.toBe("");
  expect(challenge).not.toBe("");
  const cookies = start.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const callback = new URL(authorization.searchParams.get("redirect_uri")!);
  callback.searchParams.set("code", "test-code");
  callback.searchParams.set("state", authorization.searchParams.get("state")!);
  return app.inject({
    method: "GET",
    url: callback.pathname + callback.search,
    headers: { cookie: cookies },
  });
}
it("verifies signed OIDC tokens through Fastify and keys identity by issuer and subject", async () => {
  subject = "developer-1";
  email = "oidc@example.test";
  const response = await login();
  expect(response.statusCode, response.body).toBe(302);
  expect(response.headers.location).toBe(url + "/");
  expect((await pool.query("SELECT role FROM auth.member")).rows).toEqual([{ role: "admin" }]);
  const account = await pool.query("SELECT issuer,account_id FROM auth.account");
  expect(account.rows).toEqual([{ issuer, account_id: subject }]);
  const second = await login();
  expect(second.headers.location).toBe(url + "/");
  expect((await pool.query("SELECT id FROM auth.user")).rowCount).toBe(1);
  subject = "developer-2";
  const collision = await login();
  expect(collision.headers.location).toContain("error=");
  expect((await pool.query("SELECT id FROM auth.user")).rowCount).toBe(1);
});
