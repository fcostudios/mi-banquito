import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/**/*.test.{mjs,ts}", "src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
