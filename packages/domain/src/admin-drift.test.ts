import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cronRun } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // beforeAll reports the missing integration configuration.
  }
}

const ENDPOINT = `/api/cron/drift-check-test-${randomUUID()}`;
const LOCK_KEY = `drift-test-${randomUUID()}`;
let db: typeof import("@mi-banquito/db")["db"];
let createAdminDriftService: typeof import("./admin-drift")["createAdminDriftService"];
let createPostgresAdminDriftRepository: typeof import("./admin-drift")["createPostgresAdminDriftRepository"];

function fixedClock(...values: string[]) {
  const dates = values.map((value) => new Date(value));
  return () => {
    const date = dates.shift();
    if (!date) throw new Error("test clock exhausted");
    return date;
  };
}

describe("admin drift service with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for admin drift integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ createAdminDriftService, createPostgresAdminDriftRepository } = await import("./admin-drift"));
  });

  afterAll(async () => {
    if (db) await db.delete(cronRun).where(eq(cronRun.endpoint, ENDPOINT));
  });

  it("persists a clean exit and preserves every runner output channel", async () => {
    const repository = createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: LOCK_KEY });
    const service = createAdminDriftService({
      repository,
      runner: {
        run: async () => ({
          exitCode: 0,
          stdout: "checked: contracts\nclean\n",
          stderr: "diagnostic: cache cold\n",
          rawText: "checked: contracts\ndiagnostic: cache cold\nclean\n",
          runnerKind: "local",
        }),
      },
      clock: fixedClock("2026-07-12T10:00:00.000Z", "2026-07-12T10:00:01.250Z"),
    });

    const result = await service.run();
    const latest = await repository.latest();

    expect(result).toMatchObject({ overlap: false, exitCode: 0, status: "clean" });
    expect(latest).toEqual({
      checkedAt: new Date("2026-07-12T10:00:01.250Z"),
      exitCode: 0,
      status: "clean",
      stdout: "checked: contracts\nclean\n",
      stderr: "diagnostic: cache cold\n",
      rawText: "checked: contracts\ndiagnostic: cache cold\nclean\n",
      runnerKind: "local",
    });
  });

  it("persists nonzero drift without reinterpreting the raw report", async () => {
    const repository = createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: LOCK_KEY });
    const rawText = "SECTION api\n- route mismatch\n\nSECTION schema\n- clean\n";
    const service = createAdminDriftService({
      repository,
      runner: {
        run: async () => ({ exitCode: 3, stdout: rawText, stderr: "", rawText, runnerKind: "remote" }),
      },
      clock: fixedClock("2026-07-12T11:00:00.000Z", "2026-07-12T11:00:02.000Z"),
    });

    await expect(service.run()).resolves.toMatchObject({ exitCode: 3, status: "drift" });
    await expect(repository.latest()).resolves.toMatchObject({ exitCode: 3, status: "drift", rawText });
  });

  it("persists runner errors as nonzero and never reports them clean", async () => {
    const repository = createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: LOCK_KEY });
    const service = createAdminDriftService({
      repository,
      runner: { run: async () => { throw new Error("runner unavailable"); } },
      clock: fixedClock("2026-07-12T12:00:00.000Z", "2026-07-12T12:00:00.010Z"),
    });

    await expect(service.run()).resolves.toMatchObject({
      overlap: false,
      exitCode: 70,
      status: "drift",
      rawText: "runner_error: runner unavailable",
    });
    await expect(repository.latest()).resolves.toMatchObject({
      exitCode: 70,
      status: "drift",
      rawText: "runner_error: runner unavailable",
    });
  });

  it("rejects an overlapping run while the first lock is held", async () => {
    const firstRepository = createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: LOCK_KEY });
    const secondRepository = createPostgresAdminDriftRepository({ endpoint: ENDPOINT, lockKey: LOCK_KEY });
    let releaseRunner!: () => void;
    let runnerStarted!: () => void;
    const started = new Promise<void>((resolve) => { runnerStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseRunner = resolve; });
    const first = createAdminDriftService({
      repository: firstRepository,
      runner: {
        run: async () => {
          runnerStarted();
          await release;
          return { exitCode: 0, stdout: "clean", stderr: "", rawText: "clean", runnerKind: "local" };
        },
      },
    });
    const second = createAdminDriftService({
      repository: secondRepository,
      runner: {
        run: async () => ({ exitCode: 0, stdout: "unexpected", stderr: "", rawText: "unexpected", runnerKind: "local" }),
      },
    });

    const firstRun = first.run();
    await started;
    await expect(second.run()).resolves.toEqual({ overlap: true });
    releaseRunner();
    await expect(firstRun).resolves.toMatchObject({ overlap: false, exitCode: 0 });
  });
});
