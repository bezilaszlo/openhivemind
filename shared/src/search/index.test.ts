import { expect, it } from "vitest";
import { parseQuery } from "./index";
it("uses NOT > implicit AND > OR", () =>
  expect(parseQuery('alpha -beta OR "gamma delta"')).toEqual({
    type: "or",
    left: {
      type: "and",
      left: { type: "term", value: "alpha" },
      right: { type: "not", child: { type: "term", value: "beta" } },
    },
    right: { type: "phrase", value: "gamma delta" },
  }));
it("handles grouping and escapes", () => expect(parseQuery("(a | b) \\OR").type).toBe("and"));
it.each([
  "",
  "a OR",
  '"unclosed',
  "()",
  "a )",
  "NOT",
  "a\\",
  "(".repeat(40) + "a" + ")".repeat(40),
])("rejects invalid query %s", (value) => expect(() => parseQuery(value)).toThrow());
