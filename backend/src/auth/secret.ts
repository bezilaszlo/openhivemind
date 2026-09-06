import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export function stateDirectory() {
  return process.env.SERVER_STATE_DIR ?? join(homedir(), ".local/state/openhivemind/server");
}

const codeIs = (error: unknown, ...codes: string[]) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  codes.includes(String((error as { code: unknown }).code));

// The secret must survive restarts, or every session cookie is invalidated on deploy.
export async function loadSecret(folder = stateDirectory()) {
  const path = join(folder, "auth-secret");
  try {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, randomBytes(48).toString("hex"), { flag: "wx", mode: 0o600 });
    } catch (error) {
      // A secret written by an earlier start is what we want; anything else is fatal.
      if (!codeIs(error, "EEXIST")) throw error;
    }
    return await readFile(path, "utf8");
  } catch (error) {
    if (!codeIs(error, "EACCES", "EPERM")) throw error;
    throw new Error(
      `Cannot read or create the auth secret in ${folder}: permission denied. ` +
        `This server runs as uid ${process.getuid?.() ?? "unknown"}, which must own that directory. ` +
        `Under compose, a container-state volume first populated by a root-running image stays ` +
        `root-owned; give it to the server once with ` +
        `\`docker run --rm -v <project>_app-state:/data alpine chown -R ${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000} /data\`, ` +
        `or discard it with \`docker compose down -v\` (which also drops the database). ` +
        `Setting AUTH_SECRET in the environment skips this file entirely.`,
      { cause: error },
    );
  }
}
