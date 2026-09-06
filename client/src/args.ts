export function options(args: string[]) {
  const values = new Map<string, string[]>();
  const rest: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    const next = args[index + 1];
    const value =
      equals >= 0
        ? arg.slice(equals + 1)
        : next !== undefined && !next.startsWith("--")
          ? args[++index]!
          : "";
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return {
    rest,
    list: (name: string) => values.get(name),
    get: (name: string) => values.get(name)?.at(-1),
    has: (name: string) => values.has(name),
  };
}
export type Options = ReturnType<typeof options>;
export function intFlag(
  flags: Options,
  name: string,
  bounds: { min?: number; max?: number } = {},
): { value?: number; error?: string } {
  const raw = flags.get(name);
  if (raw === undefined) return {};
  const value = Number(raw);
  const { min, max } = bounds;
  if (
    !Number.isInteger(value) ||
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  ) {
    const range =
      min !== undefined && max !== undefined
        ? ` between ${min} and ${max}`
        : min !== undefined
          ? ` >= ${min}`
          : "";
    return { error: `--${name} must be an integer${range}` };
  }
  return { value };
}
export const KINDS = ["prompt", "reply", "tool_call", "summary"] as const;
export type FilterFields = {
  remote?: string;
  author?: string;
  branch?: string;
  since?: string;
  until?: string;
  kind?: (typeof KINDS)[number];
  mine?: true;
  limit?: number;
};
// Shared by search and sessions: the remote/author/branch/time/kind/mine/limit filters they both take.
export function filters(flags: Options): { value?: FilterFields; error?: string } {
  const limit = intFlag(flags, "limit", { min: 1, max: 100 });
  if (limit.error) return { error: limit.error };
  const kind = flags.get("kind");
  if (kind !== undefined && !(KINDS as readonly string[]).includes(kind))
    return { error: `--kind must be one of ${KINDS.join(", ")}` };
  return {
    value: {
      remote: flags.get("remote"),
      author: flags.get("author"),
      branch: flags.get("branch"),
      since: flags.get("since"),
      until: flags.get("until"),
      kind: kind as (typeof KINDS)[number] | undefined,
      mine: flags.has("mine") || undefined,
      limit: limit.value,
    },
  };
}
