import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  noExternal: [/@openhivemind\//, /@sinclair\//],
  clean: true,
});
