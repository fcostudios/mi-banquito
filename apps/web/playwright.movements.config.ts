import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const orgId = randomUUID();

export default defineConfig({
  metadata: { movementOrgId: orgId },
  testDir: "./e2e",
  testMatch: "sprint8-movements.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3018",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --webpack -p 3018",
    url: "http://127.0.0.1:3018/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_AUTH_BYPASS: "1",
      AUTH0_ORGANIZATION_DB_ORG_ID: orgId,
    },
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"], viewport: { width: 393, height: 851 } } },
  ],
});
