import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    env: {
      IMPERSONATION_COOKIE_SECRET: "vitest-impersonation-secret-32-bytes",
    },
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
