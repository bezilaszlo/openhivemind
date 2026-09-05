export type Query =
  | { type: "term" | "phrase"; value: string }
  | { type: "not"; child: Query }
  | { type: "and" | "or"; left: Query; right: Query };
type Token = { type: "word" | "phrase" | "not" | "or" | "left" | "right"; value: string };
export function parseQuery(input: string): Query {
  if (!input.trim() || input.length > 4096) throw new Error("Query must contain 1–4096 characters");
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i]!;
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const special = { "(": "left", ")": "right", "|": "or", "-": "not" } as const;
    if (char in special) {
      tokens.push({ type: special[char as keyof typeof special], value: char });
      i++;
      continue;
    }
    const quoted = char === '"';
    if (quoted) i++;
    let value = "",
      closed = !quoted,
      escaped = false;
    while (i < input.length) {
      const next = input[i]!;
      if (next === "\\") {
        i++;
        if (i === input.length) throw new Error("Trailing escape");
        value += input[i++];
        escaped = true;
        continue;
      }
      if (quoted && next === '"') {
        i++;
        closed = true;
        break;
      }
      if (!quoted && /[\s()|]/.test(next)) break;
      value += next;
      i++;
    }
    if (!closed || !value) throw new Error("Empty or unterminated phrase");
    tokens.push({
      type: quoted
        ? "phrase"
        : !escaped && value === "NOT"
          ? "not"
          : !escaped && value === "OR"
            ? "or"
            : "word",
      value,
    });
    if (tokens.length > 256) throw new Error("Query has too many terms");
  }
  let position = 0;
  function unary(depth: number): Query {
    if (depth > 32) throw new Error("Query nesting exceeds 32");
    const token = tokens[position++];
    if (!token) throw new Error("Expected a term");
    if (token.type === "not") return { type: "not", child: unary(depth + 1) };
    if (token.type === "left") {
      const result = or(depth + 1);
      if (tokens[position++]?.type !== "right") throw new Error("Expected closing parenthesis");
      return result;
    }
    if (token.type === "word" || token.type === "phrase")
      return { type: token.type === "word" ? "term" : "phrase", value: token.value };
    throw new Error("Expected a term");
  }
  function and(depth: number): Query {
    let result = unary(depth);
    while (tokens[position] && !["or", "right"].includes(tokens[position]!.type))
      result = { type: "and", left: result, right: unary(depth) };
    return result;
  }
  function or(depth: number): Query {
    let result = and(depth);
    while (tokens[position]?.type === "or") {
      position++;
      result = { type: "or", left: result, right: and(depth) };
    }
    return result;
  }
  const result = or(0);
  if (position !== tokens.length) throw new Error("Unexpected closing parenthesis");
  return result;
}
