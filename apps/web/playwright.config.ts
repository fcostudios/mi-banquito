import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { defineConfig, devices } from "@playwright/test";

if (!process.env.DATABASE_URL) {
  const localEnv = resolve(__dirname, ".env.local");
  const primaryCheckoutEnv = resolve(__dirname, "../../../../apps/web/.env.local");
  const envFile = existsSync(localEnv) ? localEnv : primaryCheckoutEnv;
  if (existsSync(envFile)) loadEnvFile(envFile);
}

const orgId = randomUUID();
const actorId = randomUUID();
const nonTreasurerActorId = randomUUID();

export default defineConfig({
  metadata: { sprint9OrgId: orgId, sprint9ActorId: actorId, sprint9NonTreasurerActorId: nonTreasurerActorId },
  testDir: "./e2e",
  testIgnore: "sprint8-movements.spec.ts",
  outputDir: "../../output/playwright",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3029",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/blob-storage-server.mjs",
      url: "http://127.0.0.1:3030/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm exec next dev --webpack -p 3029",
      url: "http://127.0.0.1:3029/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        E2E_AUTH_BYPASS: "1",
        E2E_AUTH_REQUIRE_HEADER: "1",
        E2E_BLOB_READ_BASE_URL: "http://127.0.0.1:3030/blobs",
        AUTH0_ORGANIZATION_DB_ORG_ID: orgId,
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_contract_secret",
        VERCEL_BLOB_API_URL: "http://127.0.0.1:3030",
        VERCEL_BLOB_RETRIES: "0",
        IMPERSONATION_COOKIE_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    },
  ],
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
});
