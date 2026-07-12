import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLogEntry, cronRun, organization } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // beforeAll reports the missing integration configuration.
  }
}

const ORG_PENDING = randomUUID();
const ORG_CLEAN = randomUUID();
const ORG_MISSING = randomUUID();
const ACTOR_ID = randomUUID();
const DRIFT_RUN_ID = randomUUID();
const CLEAN_STREAK_ENDPOINT = `/api/cron/drift-check-clean-${randomUUID()}`;
const GAP_STREAK_ENDPOINT = `/api/cron/drift-check-gap-${randomUUID()}`;
const OLD_STREAK_ENDPOINT = `/api/cron/drift-check-old-${randomUUID()}`;
const STREAK_RUN_IDS = Array.from({ length: 7 }, () => randomUUID());
let db: typeof import("@mi-banquito/db")["db"];
let createAdminHealthService: typeof import("./admin-health")["createAdminHealthService"];
let adminHealthDashboardFromRows: typeof import("./admin-health")["adminHealthDashboardFromRows"];

describe("admin health service with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for admin health integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ createAdminHealthService, adminHealthDashboardFromRows } = await import("./admin-health"));
    await db.insert(organization).values([
      {
        id: ORG_PENDING,
        displayName: "Health pending",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "system",
      },
      {
        id: ORG_CLEAN,
        displayName: "Health clean",
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "system",
      },
    ]);
    await db.insert(auditLogEntry).values([
      {
        orgId: ORG_PENDING,
        actorKind: "system",
        actorId: ACTOR_ID,
        actionKind: "health.test",
        subjectKind: "organization",
        subjectId: ORG_PENDING,
        payloadSnapshot: {},
        reason: null,
        at: new Date("2026-07-11T10:00:00.000Z"),
        createdAt: new Date("2026-07-11T10:00:00.000Z"),
      },
      {
        orgId: ORG_CLEAN,
        actorKind: "system",
        actorId: ACTOR_ID,
        actionKind: "health.test",
        subjectKind: "organization",
        subjectId: ORG_CLEAN,
        payloadSnapshot: {},
        reason: null,
        at: new Date("2026-07-10T10:00:00.000Z"),
        createdAt: new Date("2026-07-10T10:00:00.000Z"),
      },
    ]);
    const finishedAt = new Date("2026-07-12T11:30:00.000Z");
    await db.insert(cronRun).values({
      id: DRIFT_RUN_ID,
      endpoint: "/api/cron/drift-check",
      startedAt: new Date("2026-07-12T11:29:59.000Z"),
      finishedAt,
      durationMs: 1000,
      orgsProcessed: 0,
      failureCount: 1,
      replayFrom: null,
      replayTo: null,
      summary: { kind: "drift_check", exitCode: 2, rawText: "DRIFT: contract mismatch\n" },
      triggeredByKind: "system",
      triggeredBy: null,
      createdAt: finishedAt,
    });
    await db.insert(cronRun).values([
      driftRun(STREAK_RUN_IDS[0], CLEAN_STREAK_ENDPOINT, "2026-07-05T07:00:00.000Z", 0),
      driftRun(STREAK_RUN_IDS[1], CLEAN_STREAK_ENDPOINT, "2026-06-05T07:00:00.000Z", 0),
      driftRun(STREAK_RUN_IDS[2], CLEAN_STREAK_ENDPOINT, "2026-05-05T07:00:00.000Z", 3),
      driftRun(STREAK_RUN_IDS[3], GAP_STREAK_ENDPOINT, "2026-07-05T07:00:00.000Z", 0),
      driftRun(STREAK_RUN_IDS[4], GAP_STREAK_ENDPOINT, "2026-05-05T07:00:00.000Z", 0),
      driftRun(STREAK_RUN_IDS[5], OLD_STREAK_ENDPOINT, "2026-06-05T07:00:00.000Z", 0),
      driftRun(STREAK_RUN_IDS[6], CLEAN_STREAK_ENDPOINT, "2026-06-20T07:00:00.000Z", 0),
    ]);
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_org_health_snapshot`);
    await db.insert(organization).values({
      id: ORG_MISSING,
      displayName: "Health missing",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-07-12T00:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(inArray(auditLogEntry.orgId, [ORG_PENDING, ORG_CLEAN]));
      await tx.delete(organization).where(inArray(organization.id, [ORG_PENDING, ORG_CLEAN, ORG_MISSING]));
      await tx.delete(cronRun).where(inArray(cronRun.id, [DRIFT_RUN_ID, ...STREAK_RUN_IDS]));
    });
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_org_health_snapshot`);
  });

  it("loads the org set and latest global drift result in one repository call", async () => {
    const dashboard = await createAdminHealthService({
      now: () => new Date("2026-07-12T12:00:00.000Z"),
    }).getDashboard();
    const snapshots = dashboard.snapshots;
    const fixtureOrgIds = new Set<string>([ORG_PENDING, ORG_CLEAN]);
    const rows = snapshots.filter((row) => fixtureOrgIds.has(row.orgId));

    expect(rows.map((row) => [row.orgId, row.displayName, row.lastActivityAt?.toISOString()]))
      .toEqual(expect.arrayContaining([
        [ORG_PENDING, "Health pending", "2026-07-11T10:00:00.000Z"],
        [ORG_CLEAN, "Health clean", "2026-07-10T10:00:00.000Z"],
      ]));
    expect(new Set(rows.map((row) => row.orgId))).toEqual(new Set([ORG_PENDING, ORG_CLEAN]));
    expect(rows.every((row) => row.driftExitCode === 2)).toBe(true);
    expect(rows.every((row) => row.driftRawText === "DRIFT: contract mismatch\n")).toBe(true);
    expect(rows.every((row) => row.driftCheckedAt?.toISOString() === "2026-07-12T11:30:00.000Z")).toBe(true);
    expect(dashboard.drift).toEqual({
      exitCode: 2,
      checkedAt: new Date("2026-07-12T11:30:00.000Z"),
      rawText: "DRIFT: contract mismatch\n",
    });
    expect(dashboard.snapshots.find((row) => row.orgId === ORG_MISSING)).toMatchObject({
      snapshotStatus: "missing",
      freshness: "unknown",
      hasPendingReconciliation: null,
      openLoansCount: null,
      arTotal: null,
      refreshedAt: null,
    });
  });

  it("counts only uninterrupted clean calendar months anchored to the current month", async () => {
    const now = () => new Date("2026-07-12T12:00:00.000Z");

    await expect(createAdminHealthService({ endpoint: CLEAN_STREAK_ENDPOINT, now }).getDashboard())
      .resolves.toMatchObject({ consecutiveCleanMonths: 2 });
    await expect(createAdminHealthService({ endpoint: GAP_STREAK_ENDPOINT, now }).getDashboard())
      .resolves.toMatchObject({ consecutiveCleanMonths: 1 });
    await expect(createAdminHealthService({ endpoint: OLD_STREAK_ENDPOINT, now }).getDashboard())
      .resolves.toMatchObject({ consecutiveCleanMonths: 0 });
  });

  it("marks an old materialized-view row stale instead of treating it as healthy", () => {
    const dashboard = adminHealthDashboardFromRows([healthQueryRow({
      refreshed_at: "2026-07-11T08:59:59.999Z",
      has_pending_reconciliation: false,
      open_loans_count: 0,
      ar_total: "0.0000",
    })], new Date("2026-07-12T11:00:00.000Z"));

    expect(dashboard.snapshots[0]).toMatchObject({
      snapshotStatus: "available",
      freshness: "stale",
      hasPendingReconciliation: false,
      openLoansCount: 0,
      arTotal: "0.0000",
    });
  });

  it("retains global drift when the query contains no organization row", () => {
    expect(adminHealthDashboardFromRows([{
      org_id: null,
      display_name: null,
      status: null,
      currency_code: null,
      last_activity_at: null,
      last_close_at: null,
      has_pending_reconciliation: null,
      open_loans_count: null,
      ar_total: null,
      refreshed_at: null,
      drift_exit_code: 7,
      drift_checked_at: "2026-07-12T13:00:00.000Z",
      drift_raw_text: "DRIFT without organizations\n",
      consecutive_clean_months: 0,
    }])).toEqual({
      snapshots: [],
      consecutiveCleanMonths: 0,
      drift: {
        exitCode: 7,
        checkedAt: new Date("2026-07-12T13:00:00.000Z"),
        rawText: "DRIFT without organizations\n",
      },
    });
  });
});

function driftRun(id: string, endpoint: string, finishedAtValue: string, exitCode: number) {
  const finishedAt = new Date(finishedAtValue);
  return {
    id,
    endpoint,
    startedAt: new Date(finishedAt.getTime() - 1_000),
    finishedAt,
    durationMs: 1_000,
    orgsProcessed: 0,
    failureCount: exitCode === 0 ? 0 : 1,
    replayFrom: null,
    replayTo: null,
    summary: { kind: "drift_check", exitCode, rawText: "fixture" },
    triggeredByKind: "system",
    triggeredBy: null,
    createdAt: finishedAt,
  };
}

function healthQueryRow(overrides: Partial<Parameters<typeof adminHealthDashboardFromRows>[0][number]> = {}) {
  return {
    org_id: ORG_CLEAN,
    display_name: "Health clean",
    status: "active" as const,
    currency_code: "USD",
    last_activity_at: null,
    last_close_at: null,
    has_pending_reconciliation: false,
    open_loans_count: 0,
    ar_total: "0.0000",
    refreshed_at: "2026-07-12T10:00:00.000Z",
    drift_exit_code: 0,
    drift_checked_at: "2026-07-12T10:00:00.000Z",
    drift_raw_text: "clean",
    consecutive_clean_months: 1,
    ...overrides,
  };
}
