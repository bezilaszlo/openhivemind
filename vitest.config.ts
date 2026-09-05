import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "shared/src/**/*.test.ts",
      "client/src/**/*.test.ts",
      "backend/src/**/*.test.ts",
      "frontend/src/**/*.test.{ts,tsx}",
    ],
  },
});
