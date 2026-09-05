import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  noExternal: [/@openhivemind\//, /@sinclair\//],
  clean: true,
});
