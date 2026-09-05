import { cp, rm } from "node:fs/promises";
import { defineConfig } from "tsup";
// The native plugin has to run without node_modules, so it carries its own copy of the bundle.
const plugin = "plugins/claude-code";
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  noExternal: [/@openhivemind\//, /@sinclair\//, /proper-lockfile/],
  clean: true,
  // proper-lockfile is CommonJS; bundling it into ESM needs a real require for node builtins.
  banner: {
    js: "import { createRequire as __ohmRequire } from 'node:module';\nconst require = __ohmRequire(import.meta.url);",
  },
  async onSuccess() {
    for (const folder of ["dist", "skills"]) {
      await rm(`${plugin}/${folder}`, { recursive: true, force: true });
      await cp(folder, `${plugin}/${folder}`, { recursive: true });
    }
  },
});
