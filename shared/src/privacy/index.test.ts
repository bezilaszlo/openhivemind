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
  ])
    expect(scrub(text)).toBe(text);
});
it("fails closed on invalid custom patterns", () =>
  expect(() => ignorePatterns("# comment\n[")).toThrow("line 2"));
it("applies reusable custom patterns", () => {
  const patterns = ignorePatterns("private-company");
  expect(scrub("private-company", patterns)).toBe("[REDACTED:custom]");
  expect(scrub("private-company", patterns)).toBe("[REDACTED:custom]");
});
