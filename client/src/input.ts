export async function readStdin(limit = 1024 * 1024): Promise<string> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const part of process.stdin as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > limit) throw new Error("Input is too large");
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}
