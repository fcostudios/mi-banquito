import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cronRun } from "@mi-banquito/db/schema";
import { createConfiguredDriftRunner } from "@/lib/drift/runner";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // beforeAll reports the missing integration configuration.
  }
}

const ENDPOINT = `/api/cron/drift-check-smoke-${randomUUID()}`;
let db: typeof import("@mi-banquito/db")["db"];
let repository: ReturnType<typeof import("@mi-banquito/domain")["createPostgresAdminDriftRepository"]>;
let createDriftCheckHandler: typeof import("./handler")["createDriftCheckHandler"];

describe("drift-check cron handler", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for drift cron tests");
    ({ db } = await import("@mi-banquito/db"));
    const domain = await import("@mi-banquito/domain");
    repository = domain.createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: ENDPOINT });
    ({ createDriftCheckHandler } = await import("./handler"));
  });

  afterAll(async () => {
    if (db) await db.delete(cronRun).where(eq(cronRun.endpoint, ENDPOINT));
  });

  it("rejects a missing or incorrect cron secret without persistence", async () => {
    const handler = createDriftCheckHandler({
      repository,
      runner: {
        run: async () => ({ exitCode: 0, stdout: "clean", stderr: "", rawText: "clean", runnerKind: "test" }),
      },
      getCronSecret: () => "correct-secret",
    });

    expect((await handler(new Request("http://localhost/api/cron/drift-check"))).status).toBe(401);
    expect((await handler(new Request("http://localhost/api/cron/drift-check", {
      headers: { authorization: "Bearer wrong-secret" },
    }))).status).toBe(401);
    await expect(repository.latest()).resolves.toBeUndefined();
  });

  it("runs with the correct secret and persists the injected runner result", async () => {
    const handler = createDriftCheckHandler({
      repository,
      runner: {
        run: async () => ({
          exitCode: 5,
          stdout: "DRIFT routes\n",
          stderr: "",
          rawText: "DRIFT routes\n",
          runnerKind: "test",
        }),
      },
      getCronSecret: () => "correct-secret",
    });
    const response = await handler(new Request("http://localhost/api/cron/drift-check", {
      headers: { authorization: "Bearer correct-secret" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ job: "drift-check", ran: false, exitCode: 5 });
    await expect(repository.latest()).resolves.toMatchObject({ exitCode: 5, rawText: "DRIFT routes\n" });
  });

  it("persists missing Vercel runner configuration as nonzero", async () => {
    const handler = createDriftCheckHandler({
      repository,
      runner: createConfiguredDriftRunner({ env: { VERCEL: "1" } }),
      getCronSecret: () => "correct-secret",
    });
    const response = await handler(new Request("http://localhost/api/cron/drift-check", {
      headers: { authorization: "Bearer correct-secret" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ran: false, exitCode: 70 });
    await expect(repository.latest()).resolves.toMatchObject({
      exitCode: 70,
      status: "drift",
      runnerKind: "unavailable",
      rawText: "runner_error: drift_runner_unavailable:remote_runner_missing",
    });
  });
});
