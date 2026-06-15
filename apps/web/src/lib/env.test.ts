import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseExternalProviderEnv,
  parsePublicEnv,
  parseServerEnv,
} from "./env";

const requiredExampleKeys = [
  "APP_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_DOMAIN",
  "AUTH0_ORGANIZATION",
  "AUTH0_SECRET",
  "CRON_SECRET",
  "DATABASE_URL",
  "DB_DRIVER",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "VERCEL_BLOB_READ_WRITE_TOKEN",
];

describe("environment validation", () => {
  it("fails fast with a readable missing-key error", () => {
    expect(() => parseServerEnv({})).toThrow(/Invalid environment configuration/);
    expect(() => parseServerEnv({})).toThrow(/APP_BASE_URL/);
  });

  it("accepts the core server and public runtime variables", () => {
    expect(
      parseServerEnv({
        APP_BASE_URL: "http://localhost:3000",
        AUTH0_CLIENT_ID: "client-id",
        AUTH0_CLIENT_SECRET: "client-secret",
        AUTH0_DOMAIN: "dev-example.us.auth0.com",
        AUTH0_SECRET: "0123456789abcdef0123456789abcdef",
        CRON_SECRET: "cron-secret",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
        DB_DRIVER: "pg",
      }),
    ).toMatchObject({ DB_DRIVER: "pg" });

    expect(
      parsePublicEnv({
        NEXT_PUBLIC_API_URL: "http://localhost:3000",
      }),
    ).toEqual({ NEXT_PUBLIC_API_URL: "http://localhost:3000" });
  });

  it("tracks external provider variables separately until US-005 provisions them", () => {
    expect(() => parseExternalProviderEnv({})).toThrow(/SENTRY_DSN/);
  });

  it(".env.example documents every Sprint 0 key and .env.local is ignored", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const rootGitignore = readFileSync(join(process.cwd(), "../../.gitignore"), "utf8");

    for (const key of requiredExampleKeys) {
      expect(example).toContain(`${key}=`);
    }
    expect(rootGitignore).toMatch(/\.env\.local/);
  });
});
