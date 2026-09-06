import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { testDatabase, clearDatabase } from "./database";
import { createAuth } from "../src/auth/index";
import { mountAuth, authenticate, mintToken } from "../src/auth/bridge";
import { buildApp } from "../src/app";

const url = "http://localhost:3000";
const pool = testDatabase();
const auth = createAuth(pool, { url, secret: "integration-only-not-a-production-secret-0001" });
const app = await buildApp({
  handlers: {
    tokenCreate: async (request) =>
      mintToken(
        pool,
        await authenticate(pool, auth, request, url),
        (request.body as { name: string }).name,
      ),
  },
});
beforeAll(async () => {
  await mountAuth(app, pool, auth, url);
  await app.ready();
});
beforeEach(async () => {
  await clearDatabase(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});
it("bootstraps exactly one org, requires invitations, and mints hashed PATs through Fastify", async () => {
  const register = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: {
      name: "First developer",
      email: "first@example.test",
      password: "integration-password-123",
    },
  });
  expect(register.statusCode, register.body).toBe(200);
  const cookies = register.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const members = await pool.query("SELECT role FROM auth.member");
  expect(members.rows).toEqual([{ role: "admin" }]);
  const rejected = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: {
      name: "Second developer",
      email: "second@example.test",
      password: "integration-password-123",
    },
  });
  expect(rejected.statusCode).toBe(403);
  const pat = await app.inject({
    method: "POST",
    url: "/api/v1/me/tokens",
    headers: { cookie: cookies, origin: url },
    payload: { name: "laptop" },
  });
  expect(pat.statusCode, pat.body).toBe(200);
  expect(pat.json().token).toMatch(/^ohm_[a-f0-9]{40}$/);
  const stored = await pool.query("SELECT token_sha256 FROM api_token");
  expect(stored.rows[0].token_sha256).not.toBe(pat.json().token);
  const csrf = await app.inject({
    method: "POST",
    url: "/api/v1/me/tokens",
    headers: { cookie: cookies, origin: "http://evil.test" },
    payload: { name: "bad" },
  });
  expect(csrf.statusCode).toBe(403);
});

it("accepts a single-use open invite and rejects replay", async () => {
  const first = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: { name: "Admin", email: "admin@example.test", password: "integration-password-123" },
  });
  expect(first.statusCode).toBe(200);
  const { randomUUID } = await import("node:crypto");
  const { hash } = await import("../src/auth/bridge");
  const org = (await pool.query("SELECT org_id FROM bootstrap")).rows[0].org_id;
  const creator = first.json().user.id;
  await pool.query(
    "INSERT INTO invite(id,org_id,role,token_sha256,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval '1 day',$5)",
    [randomUUID(), org, "member", hash("test-invite"), creator],
  );
  const second = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url, "x-openhivemind-invite": "test-invite" },
    payload: { name: "Member", email: "member@example.test", password: "integration-password-123" },
  });
  expect(second.statusCode, second.body).toBe(200);
  expect(
    (await pool.query("SELECT role FROM auth.member WHERE user_id=$1", [second.json().user.id]))
      .rows,
  ).toEqual([{ role: "member" }]);
  const replay = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url, "x-openhivemind-invite": "test-invite" },
    payload: { name: "Replay", email: "replay@example.test", password: "integration-password-123" },
  });
  expect(replay.statusCode).toBe(403);
});

it("serializes concurrent first registrations", async () => {
  const responses = await Promise.all(
    ["one", "two"].map((name) =>
      app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        headers: { origin: url },
        payload: { name, email: `${name}@example.test`, password: "integration-password-123" },
      }),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 403]);
  expect((await pool.query("SELECT id FROM auth.organization")).rowCount).toBe(1);
  expect((await pool.query("SELECT id FROM auth.member")).rowCount).toBe(1);
});
it("relays Better Auth rejections as problem+json so the viewer can show the reason", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: url },
    payload: { name: "Short", email: "short@example.test", password: "short" },
  });
  expect(response.statusCode).toBe(400);
  expect(response.headers["content-type"]).toContain("application/problem+json");
  expect(response.json()).toMatchObject({
    status: 400,
    detail: expect.stringMatching(/too short/i),
  });
});
function loopbackTestApp(configUrl: string, secret: string) {
  const authInstance = createAuth(pool, { url: configUrl, secret });
  const testApp = buildApp({
    handlers: {
      tokenCreate: async (request) =>
        mintToken(
          pool,
          await authenticate(pool, authInstance, request, configUrl),
          (request.body as { name: string }).name,
        ),
    },
  });
  return { authInstance, testApp };
}
it("trusts every loopback spelling on the same port, for sign-in and for a cookie-authenticated API call", async () => {
  const loopbackUrl = "http://127.0.0.1:4001";
  const { authInstance, testApp } = loopbackTestApp(
    loopbackUrl,
    "integration-only-not-a-production-secret-0004",
  );
  const loopbackApp = await testApp;
  await mountAuth(loopbackApp, pool, authInstance, loopbackUrl);
  await loopbackApp.ready();
  try {
    // The dev stack configures APP_URL with one loopback spelling, but a developer's browser may
    // sign in from another on the same port; both must be trusted as the same origin.
    const register = await loopbackApp.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: "http://localhost:4001" },
      payload: {
        name: "Loopback developer",
        email: "loopback@example.test",
        password: "integration-password-123",
      },
    });
    expect(register.statusCode, register.body).toBe(200);
    const signIn = await loopbackApp.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: "http://[::1]:4001" },
      payload: { email: "loopback@example.test", password: "integration-password-123" },
    });
    expect(signIn.statusCode, signIn.body).toBe(200);
    const cookie = signIn.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    // The API path goes through authenticate() in auth/bridge.ts, not Better Auth's own origin
    // check; it needs the same loopback equivalence for a cookie-authenticated POST.
    const token = await loopbackApp.inject({
      method: "POST",
      url: "/api/v1/me/tokens",
      headers: { cookie, origin: "http://localhost:4001" },
      payload: { name: "laptop" },
    });
    expect(token.statusCode, token.body).toBe(200);
  } finally {
    await loopbackApp.close();
  }
});
it("still rejects a mismatched origin on the API path for a non-loopback config URL", async () => {
  const publicUrl = "https://hivemind.example.test";
  const { authInstance, testApp } = loopbackTestApp(
    publicUrl,
    "integration-only-not-a-production-secret-0005",
  );
  const publicApp = await testApp;
  await mountAuth(publicApp, pool, authInstance, publicUrl);
  await publicApp.ready();
  try {
    const register = await publicApp.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: publicUrl },
      payload: {
        name: "Stranger",
        email: "stranger@example.test",
        password: "integration-password-123",
      },
    });
    expect(register.statusCode, register.body).toBe(200);
    const cookie = register.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const token = await publicApp.inject({
      method: "POST",
      url: "/api/v1/me/tokens",
      headers: { cookie, origin: "https://not-hivemind.example.test" },
      payload: { name: "laptop" },
    });
    expect(token.statusCode).toBe(403);
  } finally {
    await publicApp.close();
  }
});
