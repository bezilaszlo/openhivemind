import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor } from "./doctor";
import { login } from "./login";
import { loadConfig, configPath } from "../config";
import { atomic, upgradePath } from "../state";
const server = "http://server.test";
let home: string, real: string;
let authorized = true;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "openhivemind-doctor-"));
  vi.stubEnv("HOME", home);
  authorized = true;
  real = join(home, "code");
  await mkdir(real);
  await symlink(real, join(home, "link"));
  vi.stubGlobal("fetch", async (input: URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/v1/config"))
      return Response.json({
        appUrl: server,
        providers: ["local"],
        features: {},
        protocol: { current: 1, minimum: 1 },
      });
    if (url.endsWith("/api/v1/orgs/me") && authorized) {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ohm_secret");
      return Response.json({ id: "org-1", name: "Team", userId: "user-1", role: "admin" });
    }
    return Response.json({ detail: "Token rejected" }, { status: 401 });
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(home, { recursive: true, force: true });
});
const signIn = () =>
  login({ server, token: "ohm_secret", roots: [join(home, "link")], exclude: [] });
it("stores a private config with resolved folder controls and reports it healthy", async () => {
  await signIn();
  expect(((await stat(configPath())).mode & 0o777).toString(8)).toBe("600");
  expect((await loadConfig()).roots).toEqual([real]);
  const report = await doctor();
  expect(report.ok).toBe(true);
  expect(report.lines.join("\n")).toContain("Token: valid for Team as admin");
  expect(report.lines.join("\n")).toContain(`Roots: ${real}`);
});
it("reports a missing configuration and a rejected token", async () => {
  const missing = await doctor();
  expect(missing.ok).toBe(false);
  expect(missing.lines[0]).toContain("run openhivemind setup");
  await signIn();
  authorized = false;
  const rejected = await doctor();
  expect(rejected.ok).toBe(false);
  expect(rejected.lines.join("\n")).toContain("Token: rejected (Token rejected)");
});
it("refuses to store a login the server rejects", async () => {
  authorized = false;
  await expect(signIn()).rejects.toThrow("Token rejected");
  await expect(loadConfig()).rejects.toThrow();
});
it("names an invalid ignore line and a recorded upgrade requirement", async () => {
  const config = await signIn();
  await writeFile(join(home, ".config/openhivemind/ignore"), "ok\n[\n");
  await atomic(upgradePath(config), { detail: "Unsupported protocol", at: "2026-09-05T10:00:00Z" });
  const report = await doctor();
  expect(report.ok).toBe(false);
  expect(report.lines.join("\n")).toContain("line 2");
  expect(report.lines.join("\n")).toContain("upgrade client");
});
