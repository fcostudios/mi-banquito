import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLogEntry,
  contributionCycle,
  cronRun,
  organization,
  periodClose,
  reconciliationCycle,
} from "@mi-banquito/db/schema";

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
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_org_health_snapshot`);
    await db.insert(organization).values({
      id: ORG_MISSING,
      displayName: "Health missing",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "paused",
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
      await tx.delete(cronRun).where(eq(cronRun.id, DRIFT_RUN_ID));
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

  it("counts completed months closed successfully by both active organizations and deduplicates multiple closes", async () => {
    await withIsolatedActiveOrganizations([
      { months: ["2026-05", "2026-06", "2026-06"] },
      { months: ["2026-05", "2026-06"] },
    ], async (transactionDb) => {
      await expect(createAdminHealthService({
        db: transactionDb,
        now: () => new Date("2026-07-12T12:00:00.000Z"),
      }).getDashboard()).resolves.toMatchObject({ consecutiveCleanMonths: 2 });
    });
  });

  it("ends the streak at the first month where an active organization has no close", async () => {
    await withIsolatedActiveOrganizations([
      { months: ["2026-04", "2026-05", "2026-06"] },
      { months: ["2026-04", "2026-06"] },
    ], async (transactionDb) => {
      await expect(createAdminHealthService({
        db: transactionDb,
        now: () => new Date("2026-07-12T12:00:00.000Z"),
      }).getDashboard()).resolves.toMatchObject({ consecutiveCleanMonths: 1 });
    });
  });

  it("returns zero when the latest completed month is missing a successful reconciliation", async () => {
    await withIsolatedActiveOrganizations([
      { months: ["2026-06"] },
      { months: ["2026-06"], unsuccessfulMonth: "2026-06" },
    ], async (transactionDb) => {
      await expect(createAdminHealthService({
        db: transactionDb,
        now: () => new Date("2026-07-12T12:00:00.000Z"),
      }).getDashboard()).resolves.toMatchObject({ consecutiveCleanMonths: 0 });
    });
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

type TransactionDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withIsolatedActiveOrganizations(
  fixtures: Array<{ months: string[]; unsuccessfulMonth?: string }>,
  assertion: (transactionDb: TransactionDb) => Promise<void>,
) {
  const rollback = new Error("rollback_admin_health_fixture");
  try {
    await db.transaction(async (tx) => {
      await tx.update(organization).set({ status: "paused" }).where(eq(organization.status, "active"));

      for (const [orgIndex, fixture] of fixtures.entries()) {
        const orgId = randomUUID();
        await tx.insert(organization).values({
          id: orgId,
          displayName: `Streak org ${orgIndex}`,
          countryCode: "EC",
          currencyCode: "USD",
          timezone: "America/Guayaquil",
          defaultLanguage: "es-EC",
          status: "active",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          createdBy: ACTOR_ID,
          createdByKind: "system",
        });

        for (const [closeIndex, month] of fixture.months.entries()) {
          const cycleId = randomUUID();
          const reconciliationId = randomUUID();
          const periodCloseId = randomUUID();
          const closesOn = `${month}-28`;
          const closedAt = new Date(`${month}-28T17:00:00.000Z`);
          await tx.insert(contributionCycle).values({
            id: cycleId,
            orgId,
            cycleLabel: `${month}-${orgIndex}-${closeIndex}`,
            kind: "monthly",
            opensOn: `${month}-01`,
            closesOn,
            expectedAmountPerMember: "10.0000",
            currencyCode: "USD",
            status: "closed",
            createdAt: new Date(`${month}-01T00:00:00.000Z`),
            createdBy: ACTOR_ID,
            createdByKind: "system",
          });
          await tx.insert(reconciliationCycle).values({
            id: reconciliationId,
            orgId,
            cycleId,
            declaredBankBalance: "100.0000",
            computedPoolBalance: "100.0000",
            discrepancyAmount: "0.0000",
            toleranceAmount: "0.0000",
            resolutionKind: "auto_within_tolerance",
            resolutionNote: null,
            closedAt: null,
            periodCloseId: null,
            adjustmentReason: null,
            adjustmentWindowOpensAt: null,
            adjustmentWindowClosesAt: null,
            createdAt: closedAt,
            createdBy: ACTOR_ID,
            createdByKind: "system",
          });
          await tx.insert(periodClose).values({
            id: periodCloseId,
            orgId,
            cycleId,
            reconciliationCycleId: reconciliationId,
            closedAt,
            closedBy: ACTOR_ID,
            closedByKind: "system",
            isYearEnd: false,
            monthlyCloseStatementId: null,
            createdAt: closedAt,
          });
          if (fixture.unsuccessfulMonth !== month) {
            await tx.update(reconciliationCycle).set({
              closedAt,
              periodCloseId,
            }).where(eq(reconciliationCycle.id, reconciliationId));
          }
        }
      }

      await assertion(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
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
