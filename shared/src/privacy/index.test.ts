import { expect, it } from "vitest";
import { ignorePatterns, scrub, scrubValue, toolSummary } from "./index";
it("scrubs secrets in every nested field", () => {
  const secret = "ohm_" + "ab".repeat(20);
  expect(
    scrubValue({ title: secret, meta: { cwd: secret, branches: [secret] }, text: secret }),
  ).toEqual({
    title: "[REDACTED:openhivemind]",
    meta: { cwd: "[REDACTED:openhivemind]", branches: ["[REDACTED:openhivemind]"] },
    text: "[REDACTED:openhivemind]",
  });
});
it.each([
  'password="example value"',
  "token: example",
  "sk-" + "aB3_".repeat(10),
  "AKIA" + "A".repeat(16),
  "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----",
])("scrubs known credential forms", (secret) => expect(scrub(secret)).not.toContain(secret));
it("redacts tool input before truncation", () =>
  expect(toolSummary("bash", "echo " + "x".repeat(300) + "; cat .env")).toBe("bash [redacted]"));
it("preserves identifiers and paths", () => {
  for (const text of [
    "a".repeat(40),
    "01991234-1234-7123-8123-123456789abc",
    "/home/developer/projects/a-long-project-directory",
    "https://github.com/openhivemind/openhivemind/blob/main/docs/privacy.md",
    "node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/typescript.js",
    "~/.codex/sessions/2026/09/06/rollout-2026-09-06T08-33-17-01a0756b-db1c-7892-84eb-764609d18206.jsonl",
    "index.crates.io-1949cf8c6b5b557f",
    "com.example.Http2ClientConnectionPoolManagerFactory",
    "src/components/MyVeryLongComponentName2FactoryHelper.tsx",
  ])
    expect(scrub(text)).toBe(text);
});
// A separator is not evidence of a path: the secret is still one long random run beside it.
it("still catches a high-entropy secret with punctuation appended", () => {
  const secret = "aB3xK9zQwErTyUiOpAsDfGhJkLzXcVbNm12345";
  expect(scrub(secret)).toBe("[REDACTED:entropy]");
  for (const decorated of [
    `${secret}.x`,
    `${secret}/x`,
    `./${secret}`,
    `v1.0/${secret}`,
    `https://example.test/callback/${secret}`,
    `${secret}.tar.gz`,
  ])
    expect(scrub(decorated)).not.toContain(secret);
});
it("fails closed on invalid custom patterns", () =>
  expect(() => ignorePatterns("# comment\n[")).toThrow("line 2"));
it("applies reusable custom patterns", () => {
  const patterns = ignorePatterns("private-company");
  expect(scrub("private-company", patterns)).toBe("[REDACTED:custom]");
  expect(scrub("private-company", patterns)).toBe("[REDACTED:custom]");
});
