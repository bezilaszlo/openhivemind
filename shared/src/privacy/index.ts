import rules from "./scrub_patterns.json";
const patterns = rules.patterns.map((rule) => ({
  kind: rule.kind,
  regex: new RegExp(rule.pattern, rule.flags ?? "g"),
}));
export function ignorePatterns(text: string): RegExp[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return [];
    try {
      return [new RegExp(line, "g")];
    } catch {
      throw new Error(`Invalid ignore pattern at line ${index + 1}`);
    }
  });
}
const CANDIDATE = 32;
function secretLike(value: string): boolean {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[_+=-]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  const entropy = [...new Set(value)].reduce((sum, char) => {
    const p = value.split(char).length - 1;
    const ratio = p / value.length;
    return sum - ratio * Math.log2(ratio);
  }, 0);
  return classes >= 3 && entropy >= 3.5;
}
// A fully qualified Java name or a React filename packs its words into one long run with the odd
// digit in it. They are still words: CamelCase splits them into several real ones covering most of
// the run, where a random run breaks into two- and three-character noise.
function wordy(run: string): boolean {
  const words = run.split(/(?=[A-Z])|_/).filter((word) => /^[A-Za-z]{4,}$/.test(word));
  return words.length >= 3 && words.join("").length >= run.length * 0.6;
}
// A path, URL or package name is words held apart by separators, so no single run of letters and
// digits inside it is long and random enough to be a secret on its own. Appending `.x` or `/x` to
// a secret leaves that run intact, which is why the separator alone must never buy an exemption.
function pathLike(value: string): boolean {
  if (!/[/.]/.test(value)) return false;
  return !(value.match(/[A-Za-z0-9]+/g) ?? []).some(
    (run) => run.length >= CANDIDATE && secretLike(run) && !wordy(run),
  );
}
export function scrub(text: string, extra: readonly RegExp[] = []): string {
  for (const { kind, regex } of patterns)
    text = text.replace(new RegExp(regex.source, regex.flags), `[REDACTED:${kind}]`);
  text = text.replace(new RegExp(`\\b[A-Za-z0-9_+/=.-]{${CANDIDATE},}\\b`, "g"), (value) => {
    if (
      /^[a-f\d]{32,}$/i.test(value) ||
      /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ||
      pathLike(value)
    )
      return value;
    return secretLike(value) ? "[REDACTED:entropy]" : value;
  });
  for (const pattern of extra)
    text = text.replace(
      new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`),
      "[REDACTED:custom]",
    );
  return text;
}
export function scrubValue(value: unknown, extra: readonly RegExp[] = []): unknown {
  if (typeof value === "string") return scrub(value, extra);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, extra));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubValue(item, extra)]),
    );
  return value;
}
export function toolSummary(name: string, input: unknown, extra: readonly RegExp[] = []): string {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? {});
  if (
    /\b(?:env|printenv|secret|token|password|credentials)\b|\.env|gh\s+auth|\.pem|\.key|\.netrc|\.npmrc|kubeconfig|\.aws\/|\.ssh\//i.test(
      text,
    )
  )
    return `${scrub(name, extra)} [redacted]`;
  return `${scrub(name, extra)} ${scrub(text, extra).slice(0, 200).replace(/\s+/g, " ")}`;
}
