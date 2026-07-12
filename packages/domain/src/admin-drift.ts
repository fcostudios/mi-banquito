import { desc, eq, sql } from "drizzle-orm";

import { db as defaultDb } from "@mi-banquito/db";
import { cronRun } from "@mi-banquito/db/schema";

export const DRIFT_CRON_ENDPOINT = "/api/cron/drift-check";
const DEFAULT_LOCK_KEY = "mi-banquito:admin-drift-check";
const RUNNER_ERROR_EXIT_CODE = 70;

export type DriftRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  rawText: string;
  runnerKind: string;
};

export type DriftRunner = {
  run(): Promise<DriftRunnerResult>;
};

export type PersistedDriftResult = DriftRunnerResult & {
  checkedAt: Date;
  status: "clean" | "drift";
};

type DriftPersistenceInput = DriftRunnerResult & {
  startedAt: Date;
  finishedAt: Date;
};

export type AdminDriftRepository = {
  runExclusive<T>(work: (persist: (input: DriftPersistenceInput) => Promise<void>) => Promise<T>): Promise<T | undefined>;
  latest(): Promise<PersistedDriftResult | undefined>;
};

type DriftSummary = {
  kind: "drift_check";
  status: "clean" | "drift";
  exitCode: number;
  stdout: string;
  stderr: string;
  rawText: string;
  runnerKind: string;
};

function statusForExitCode(exitCode: number): "clean" | "drift" {
  return exitCode === 0 ? "clean" : "drift";
}

function rowsFromResult<T>(result: T[] | { rows?: T[] }): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function parseDriftSummary(value: unknown): DriftSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const summary = value as Record<string, unknown>;
  if (
    summary.kind !== "drift_check"
    || typeof summary.exitCode !== "number"
    || !Number.isInteger(summary.exitCode)
    || typeof summary.stdout !== "string"
    || typeof summary.stderr !== "string"
    || typeof summary.rawText !== "string"
    || typeof summary.runnerKind !== "string"
  ) {
    return undefined;
  }
  return {
    kind: "drift_check",
    status: statusForExitCode(summary.exitCode),
    exitCode: summary.exitCode,
    stdout: summary.stdout,
    stderr: summary.stderr,
    rawText: summary.rawText,
    runnerKind: summary.runnerKind,
  };
}

export function createPostgresAdminDriftRepository(options: {
  endpoint?: string;
  lockKey?: string;
  db?: typeof defaultDb;
} = {}): AdminDriftRepository {
  const db = options.db ?? defaultDb;
  const endpoint = options.endpoint ?? DRIFT_CRON_ENDPOINT;
  const lockKey = options.lockKey ?? DEFAULT_LOCK_KEY;

  return {
    async runExclusive(work) {
      return db.transaction(async (tx) => {
        const lockResult = await tx.execute(sql`
          SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS acquired
        `);
        const [lock] = rowsFromResult(lockResult as unknown as { rows?: Array<{ acquired: boolean }> });
        if (!lock?.acquired) return undefined;

        return work(async (input) => {
          const status = statusForExitCode(input.exitCode);
          const summary: DriftSummary = {
            kind: "drift_check",
            status,
            exitCode: input.exitCode,
            stdout: input.stdout,
            stderr: input.stderr,
            rawText: input.rawText,
            runnerKind: input.runnerKind,
          };
          await tx.insert(cronRun).values({
            endpoint,
            startedAt: input.startedAt,
            finishedAt: input.finishedAt,
            durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
            orgsProcessed: 0,
            failureCount: input.exitCode === 0 ? 0 : 1,
            replayFrom: null,
            replayTo: null,
            summary,
            triggeredByKind: "system",
            triggeredBy: null,
            createdAt: input.finishedAt,
          });
        });
      });
    },

    async latest() {
      const [row] = await db.select({ finishedAt: cronRun.finishedAt, summary: cronRun.summary })
        .from(cronRun)
        .where(eq(cronRun.endpoint, endpoint))
        .orderBy(desc(cronRun.finishedAt), desc(cronRun.id))
        .limit(1);
      const summary = parseDriftSummary(row?.summary);
      if (!row || !summary) return undefined;
      return {
        checkedAt: row.finishedAt,
        exitCode: summary.exitCode,
        status: statusForExitCode(summary.exitCode),
        stdout: summary.stdout,
        stderr: summary.stderr,
        rawText: summary.rawText,
        runnerKind: summary.runnerKind,
      };
    },
  };
}

export function createAdminDriftService(input: {
  repository: AdminDriftRepository;
  runner: DriftRunner;
  clock?: () => Date;
}) {
  const clock = input.clock ?? (() => new Date());

  return {
    async run() {
      const result = await input.repository.runExclusive(async (persist) => {
        const startedAt = clock();
        let runnerResult: DriftRunnerResult;
        try {
          runnerResult = await input.runner.run();
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown runner failure";
          runnerResult = {
            exitCode: RUNNER_ERROR_EXIT_CODE,
            stdout: "",
            stderr: "",
            rawText: `runner_error: ${message}`,
            runnerKind: "unavailable",
          };
        }
        const finishedAt = clock();
        await persist({ ...runnerResult, startedAt, finishedAt });
        return {
          overlap: false as const,
          ...runnerResult,
          status: statusForExitCode(runnerResult.exitCode),
          checkedAt: finishedAt,
        };
      });

      return result ?? { overlap: true as const };
    },
  };
}
