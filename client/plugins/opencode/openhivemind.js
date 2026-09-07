import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const database = () =>
  join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "opencode", "opencode.db");
// opencode has no hook contract, so the plugin builds the event the CLI's opencode adapter
// expects. Fire-and-forget: the hook only spools, and opencode must never wait for or fail on it.
export default async ({ directory }) => ({
  event: async ({ event }) => {
    if (event.type !== "session.idle") return;
    const child = spawn("node", [join(root, "dist", "cli.js"), "hook"], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", () => {});
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({
        source: "opencode",
        sessionId: event.properties.sessionID,
        dbPath: database(),
        cwd: directory,
      }),
    );
    child.unref();
  },
});
