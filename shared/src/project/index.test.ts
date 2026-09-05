import { describe, expect, it } from "vitest";
import { normalizeRemote } from "./index";
describe("project identity", () => {
  it.each([
    "git@github.com:Alvicom/Demo.git",
    "ssh://git@github.com:22/Alvicom/Demo",
    "https://user:placeholder@github.com/Alvicom/Demo/",
    "GitHub.com/alvicom/demo",
    "git+ssh://git@github.com/ALVICOM/demo.git",
  ])("normalizes %s", (value) => expect(normalizeRemote(value)).toBe("github.com/alvicom/demo"));
  it("keeps nested groups and local remotes", () => {
    expect(normalizeRemote("git@gitlab.com:group/sub/repo.git")).toBe("gitlab.com/group/sub/repo");
    expect(normalizeRemote("/srv/git/x.git")).toBe("/srv/git/x");
  });
});
