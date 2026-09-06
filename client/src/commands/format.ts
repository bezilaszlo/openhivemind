export type Format = "plain" | "md";
export function readFormat(value: string | undefined): Format {
  if (value === undefined) return "plain";
  if (value === "md" || value === "plain") return value;
  throw new Error(`Unknown --format ${value}; use plain or md`);
}
export function heading(format: Format, text: string): string {
  return format === "md" ? `## ${text}` : text;
}
export function bullet(format: Format, text: string): string {
  return format === "md" ? `- ${text}` : `  ${text}`;
}
export function table(format: Format, header: string[], rows: string[][]): string[] {
  if (format === "plain") {
    const widths = header.map((column, index) =>
      Math.max(column.length, ...rows.map((row) => (row[index] ?? "").length)),
    );
    const line = (cells: string[]) =>
      cells.map((cell, index) => cell.padEnd(widths[index]!)).join("  ");
    return [line(header), ...rows.map(line)];
  }
  const escape = (cell: string) => cell.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const line = (cells: string[]) => `| ${cells.map(escape).join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)];
}
export function truncate(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}… (truncated)` : flat;
}
