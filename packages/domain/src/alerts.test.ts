import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { alert, alertAction, auditLogEntry } from "@mi-banquito/db/schema";
import {
  buildA4LiquidityLowMarginAlert,
  buildA5ShareOutCommitmentAlert,
} from "./sprint7-alerts";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeSelectBuilder {
  constructor(private readonly nextResult: () => unknown[]) {}

  from() {
    return this;
  }

  innerJoin() {
    return this;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  limit() {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.nextResult()).then(onfulfilled, onrejected);
  }
}

class FakeInsertBuilder {
  constructor(
    private readonly table: unknown,
    private readonly inserts: InsertRecord[],
  ) {}

  values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.inserts.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  returning() {
    const rows = insertedRows({ inserts: this.inserts } as FakeDb, this.table);
    return Promise.resolve([rows[rows.length - 1] ?? {}]);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  private readonly selectResults: unknown[][];
  private readonly executeResults: unknown[][];

  constructor(selectResults: unknown[][] = [], executeResults: unknown[][] = []) {
    this.selectResults = [...selectResults];
    this.executeResults = [...executeResults];
  }

  select() {
    return new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
  }

  execute() {
    return Promise.resolve({ rows: this.executeResults.shift() ?? [] });
  }
}

function insertedRows(fakeDb: FakeDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.inserts
    .filter((entry) => entry.tableName === tableNameOf(table))
    .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);
}

async function withMockedDb<T>(fakeDb: FakeDb, callback: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<T>) => run(fakeDb),
  }));
  try {
    return await callback();
  } finally {
    vi.doUnmock("@mi-banquito/db");
    vi.doUnmock("@mi-banquito/db/tenant");
    vi.resetModules();
  }
}

describe("alerts", () => {
  it("classifies close overdue alerts by latest close and configured threshold", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { closeOverdueAlertState } = await import("./alerts");

      expect(closeOverdueAlertState({
        today: new Date("2026-07-20T12:00:00.000Z"),
        latestClosedAt: new Date("2026-07-05T10:00:00.000Z"),
        thresholdDays: 14,
      })).toEqual({ overdue: true, daysSinceClose: 15, thresholdDays: 14 });
      expect(closeOverdueAlertState({
        today: new Date("2026-07-19T12:00:00.000Z"),
        latestClosedAt: new Date("2026-07-05T10:00:00.000Z"),
        thresholdDays: 14,
      })).toEqual({ overdue: false, daysSinceClose: 14, thresholdDays: 14 });
    });
  });

  it("emits one A8 close overdue alert per org when the 24 hour dedup window is clear", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId, displayName: "Mi Banquito", createdAt: new Date("2026-07-01T00:00:00.000Z") }],
      [{ config: { close_overdue_threshold_days: 3 } }],
      [{ closedAt: new Date("2026-07-01T00:00:00.000Z") }],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitCloseOverdueAlerts({
        today: new Date("2026-07-05T12:00:00.000Z"),
      })).resolves.toMatchObject({
        orgsScanned: 1,
        alertsEmitted: 1,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A8",
        severity: "medium",
        audience: "both",
        subjectKind: "organization",
        subjectId: orgId,
        payload: expect.objectContaining({ daysSinceClose: 4, thresholdDays: 3 }),
      }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({ actionKind: "alert.close_overdue.emit" }),
    ]);
  });

  it("uses append-only actions to compute dismissed and snoozed state", async () => {
    let state: ReturnType<(typeof import("./alerts"))["effectiveAlertState"]> | undefined;
    await withMockedDb(new FakeDb(), async () => {
      const { effectiveAlertState } = await import("./alerts");
      state = effectiveAlertState({
        alert: { id: "a1", severity: "critical", createdAt: new Date("2026-07-02T00:00:00.000Z") },
        actions: [
          {
            actionKind: "snooze",
            snoozedUntil: new Date("2026-07-09T00:00:00.000Z"),
            createdAt: new Date("2026-07-02T01:00:00.000Z"),
          },
        ],
        now: new Date("2026-07-03T00:00:00.000Z"),
      });
    });

    expect(state?.visible).toBe(false);
    expect(state?.dismissed).toBe(false);
    expect(state?.snoozedUntil?.toISOString()).toBe("2026-07-09T00:00:00.000Z");
  });

  it("shows expired snoozes and hides dismissed alerts", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { effectiveAlertState } = await import("./alerts");
      expect(effectiveAlertState({
        alert: { id: "a1", severity: "high", createdAt: new Date("2026-07-02T00:00:00.000Z") },
        actions: [{
          actionKind: "snooze",
          snoozedUntil: new Date("2026-07-03T00:00:00.000Z"),
          createdAt: new Date("2026-07-02T01:00:00.000Z"),
        }],
        now: new Date("2026-07-04T00:00:00.000Z"),
      }).visible).toBe(true);
      expect(effectiveAlertState({
        alert: { id: "a1", severity: "high", createdAt: new Date("2026-07-02T00:00:00.000Z") },
        actions: [{
          actionKind: "dismiss",
          snoozedUntil: null,
          createdAt: new Date("2026-07-02T01:00:00.000Z"),
        }],
        now: new Date("2026-07-04T00:00:00.000Z"),
      })).toMatchObject({ visible: false, dismissed: true });
    });
  });

  it("builds a plain WhatsApp message", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { whatsAppAlertText } = await import("./alerts");
      expect(whatsAppAlertText({
        title: "Préstamo en mora",
        body: "María debe $15.00",
      })).toBe("Mi Banquito: Préstamo en mora. María debe $15.00");
    });
  });

  it("builds A1 pending reconciliation copy for the prior month", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { pendingReconciliationAlertPayload } = await import("./alerts");
      expect(pendingReconciliationAlertPayload({ prevMonth: "junio 2026" })).toEqual({
        title: "Conciliación pendiente",
        body: "El mes de junio 2026 aún no está cerrado. Te recomiendo cerrar antes de la próxima reunión.",
        prevMonth: "junio 2026",
      });
    });
  });

  it("builds A2 loan due soon copy with member and outstanding balance", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { loanDueSoonAlertPayload } = await import("./alerts");
      expect(loanDueSoonAlertPayload({ member: "Ana Mora", outstanding: "125.50" })).toEqual({
        title: "Préstamo próximo a vencer",
        body: "El préstamo de Ana Mora vence en 7 días. Saldo actual: USD 125.50.",
        member: "Ana Mora",
        outstanding: "125.50",
      });
    });
  });

  it("builds A3 late contribution copy with month, member, and days", async () => {
    await withMockedDb(new FakeDb(), async () => {
      const { contributionLateAlertPayload } = await import("./alerts");
      expect(contributionLateAlertPayload({ month: "julio 2026", member: "Ana Mora", days: 8 })).toEqual({
        title: "Aporte atrasado",
        body: "El aporte de julio 2026 de Ana Mora está atrasado por 8 días.",
        month: "julio 2026",
        member: "Ana Mora",
        days: 8,
      });
    });
  });

  it("emits A1/A2/A3 Sprint 6 daily alerts and counts dedup skips", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const loanId = "22222222-2222-4222-8222-222222222222";
    const memberId = "33333333-3333-4333-8333-333333333333";
    const duplicateMemberId = "44444444-4444-4444-8444-444444444444";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId,
        alertKind: "A3",
        severity: "medium",
        audience: "treasurer",
        subjectKind: "member",
        subjectId: duplicateMemberId,
        payload: {},
        dedupWindowEnd: new Date("2026-07-06T00:00:00.000Z"),
        createdAt: new Date("2026-07-05T00:00:00.000Z"),
      }],
    ], [
      [{ loan_id: loanId, member: "Ana Mora", outstanding: "125.5" }],
      [
        { member_id: memberId, display_name: "Ana Mora", closes_on: "2026-07-01" },
        { member_id: duplicateMemberId, display_name: "Bea Solis", closes_on: "2026-07-01" },
      ],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint6DailyAlerts({
        today: new Date("2026-07-05T12:00:00.000Z"),
      })).resolves.toEqual({
        pendingReconciliationAlertsEmitted: 1,
        loanDueSoonAlertsEmitted: 1,
        contributionLateAlertsEmitted: 1,
        skippedExisting: 1,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A1",
        severity: "high",
        audience: "treasurer",
        subjectKind: "contribution_cycle",
        subjectId: orgId,
        payload: expect.objectContaining({ prevMonth: "junio 2026" }),
      }),
      expect.objectContaining({
        alertKind: "A2",
        severity: "medium",
        audience: "treasurer",
        subjectKind: "loan",
        subjectId: loanId,
        payload: expect.objectContaining({ member: "Ana Mora", outstanding: "125.50" }),
      }),
      expect.objectContaining({
        alertKind: "A3",
        severity: "medium",
        audience: "treasurer",
        subjectKind: "member",
        subjectId: memberId,
        payload: expect.objectContaining({ month: "julio 2026", member: "Ana Mora", days: 4 }),
      }),
    ]);
  });

  it("skips A1 when the prior month is already closed", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
      [],
    ], [[], []]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint6DailyAlerts({
        today: new Date("2026-07-05T12:00:00.000Z"),
      })).resolves.toEqual({
        pendingReconciliationAlertsEmitted: 0,
        loanDueSoonAlertsEmitted: 0,
        contributionLateAlertsEmitted: 0,
        skippedExisting: 1,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("emits A4 for projected liquidity below margin and dedupes by org month", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const septemberSubjectId = buildA4LiquidityLowMarginAlert({
      orgId,
      month: "2026-09",
      projectedBalance: "75.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-06T00:00:00.000Z"),
    }).subjectId;
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ safetyMarginAmount: "100.0000", config: { safety_margin_amount: "100.0000" } }],
      [
        { monthOn: "2026-08-01", projectedBalance: "80.0000" },
        { monthOn: "2026-09-01", projectedBalance: "75.0000" },
      ],
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId,
        alertKind: "A4",
        subjectKind: "liquidity_projection",
        subjectId: septemberSubjectId,
        payload: { month: "2026-09" },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
      }],
      [],
      [],
      [],
    ], [[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4OrgsScanned: 1,
        a4MonthsScanned: 2,
        a4AlertsEmitted: 1,
        a4AlertsSkippedExisting: 1,
        a4Failures: 0,
        a5CommitmentsScanned: 0,
        a5AlertsEmitted: 0,
        a5AlertsSkippedExisting: 0,
        a5Failures: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A4",
        severity: "high",
        audience: "treasurer",
        subjectKind: "liquidity_projection",
        subjectId: expect.not.stringMatching(orgId),
        payload: expect.objectContaining({ month: "2026-08" }),
      }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({ actionKind: "alert.liquidity_low_margin.emit" }),
    ]);
  });

  it("emits separate A4 rows for separate breached months", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ safetyMarginAmount: "100.0000", config: { safety_margin_amount: "100.0000" } }],
      [
        { monthOn: "2026-08-01", projectedBalance: "80.0000" },
        { monthOn: "2026-09-01", projectedBalance: "75.0000" },
      ],
      [],
      [],
      [],
      [],
    ], [[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4AlertsEmitted: 2,
        a4AlertsSkippedExisting: 0,
        failures: [],
      });
    });

    const rows = insertedRows(fakeDb, alert);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.payload)).toEqual([
      expect.objectContaining({ month: "2026-08" }),
      expect.objectContaining({ month: "2026-09" }),
    ]);
    expect(new Set(rows.map((row) => row.subjectId))).toHaveProperty("size", 2);
    expect(rows.every((row) => row.subjectId !== orgId)).toBe(true);
  });

  it("clears an existing A4 alert when its month is no longer breached", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const subjectId = buildA4LiquidityLowMarginAlert({
      orgId,
      month: "2026-08",
      projectedBalance: "80.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-01T00:00:00.000Z"),
    }).subjectId;
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ safetyMarginAmount: "100.0000", config: { safety_margin_amount: "100.0000" } }],
      [{ monthOn: "2026-08-01", projectedBalance: "120.0000" }],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId,
        alertKind: "A4",
        severity: "high",
        audience: "treasurer",
        subjectKind: "liquidity_projection",
        subjectId,
        payload: { month: "2026-08" },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      }],
      [],
      [],
    ], [[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4AlertsEmitted: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    expect(insertedRows(fakeDb, alertAction)).toEqual([
      expect.objectContaining({
        alertId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actionKind: "dismiss",
        actorKind: "system",
      }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({ actionKind: "alert.liquidity_low_margin.clear" }),
    ]);
  });

  it("does not let a dismissed A4 alert suppress a re-breached month", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const subjectId = buildA4LiquidityLowMarginAlert({
      orgId,
      month: "2026-08",
      projectedBalance: "80.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-01T00:00:00.000Z"),
    }).subjectId;
    const alertId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ safetyMarginAmount: "100.0000", config: { safety_margin_amount: "100.0000" } }],
      [{ monthOn: "2026-08-01", projectedBalance: "80.0000" }],
      [{
        id: alertId,
        orgId,
        alertKind: "A4",
        severity: "high",
        audience: "treasurer",
        subjectKind: "liquidity_projection",
        subjectId,
        payload: { month: "2026-08" },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      }],
      [{
        alertId,
        actionKind: "dismiss",
        snoozedUntil: null,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      }],
      [],
      [],
    ], [[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4AlertsEmitted: 1,
        a4AlertsSkippedExisting: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A4",
        subjectId,
        payload: expect.objectContaining({ month: "2026-08" }),
      }),
    ]);
    expect(insertedRows(fakeDb, alertAction)).toHaveLength(0);
  });

  it("does not clear already dismissed A4 and A5 alerts again", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const a4Id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const a5Id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const a4SubjectId = buildA4LiquidityLowMarginAlert({
      orgId,
      month: "2026-08",
      projectedBalance: "80.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-01T00:00:00.000Z"),
    }).subjectId;
    const a5SubjectId = buildA5ShareOutCommitmentAlert({
      orgId,
      year: 2026,
      commitment: "500.0000",
      projectedAvailable: "300.0000",
      now: new Date("2026-07-01T00:00:00.000Z"),
    }).subjectId;
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [{ safetyMarginAmount: "100.0000", config: { safety_margin_amount: "100.0000" } }],
      [{ monthOn: "2026-08-01", projectedBalance: "120.0000" }],
      [{
        id: a4Id,
        orgId,
        alertKind: "A4",
        severity: "high",
        audience: "treasurer",
        subjectKind: "liquidity_projection",
        subjectId: a4SubjectId,
        payload: { month: "2026-08" },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      }],
      [{
        alertId: a4Id,
        actionKind: "dismiss",
        snoozedUntil: null,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      }],
      [{
        id: a5Id,
        orgId,
        alertKind: "A5",
        severity: "high",
        audience: "treasurer",
        subjectKind: "year_end_share_out",
        subjectId: a5SubjectId,
        payload: { year: 2026 },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      }],
      [{
        alertId: a5Id,
        actionKind: "dismiss",
        snoozedUntil: null,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      }],
    ], [[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4AlertsEmitted: 0,
        a5AlertsEmitted: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alertAction)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("emits A5 for share-out commitments above projected cash and dedupes by org year", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const year2027SubjectId = buildA5ShareOutCommitmentAlert({
      orgId,
      year: 2027,
      commitment: "600.0000",
      projectedAvailable: "100.0000",
      now: new Date("2026-07-06T00:00:00.000Z"),
    }).subjectId;
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orgId,
        alertKind: "A5",
        subjectKind: "year_end_share_out",
        subjectId: year2027SubjectId,
        payload: { year: 2027 },
        dedupWindowEnd: new Date("2026-07-13T00:00:00.000Z"),
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
      }],
      [],
      [],
    ], [[
      { year: 2026, commitment: "500.0000", projected_available: "300.0000" },
      { year: 2027, commitment: "600.0000", projected_available: "100.0000" },
    ]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a4OrgsScanned: 1,
        a4MonthsScanned: 0,
        a4AlertsEmitted: 0,
        a4AlertsSkippedExisting: 0,
        a4Failures: 0,
        a5CommitmentsScanned: 2,
        a5AlertsEmitted: 1,
        a5AlertsSkippedExisting: 1,
        a5Failures: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A5",
        severity: "high",
        audience: "treasurer",
        subjectKind: "year_end_share_out",
        subjectId: expect.not.stringMatching(orgId),
        payload: expect.objectContaining({ year: 2026, commitment: "500.0000", projectedAvailable: "300.0000" }),
      }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({ actionKind: "alert.shareout_commitment.emit" }),
    ]);
  });

  it("uses a newer approved governance decision over an older share-out for A5", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
      [],
    ], [[
      {
        year: 2026,
        commitment: "450.0000",
        projected_available: "300.0000",
        source_kind: "share_out",
        status: "draft",
        version: 1,
        committed_at: new Date("2026-06-01T00:00:00.000Z"),
      },
      {
        year: 2026,
        commitment: "700.0000",
        projected_available: "300.0000",
        source_kind: "governance_decision",
        status: "approved",
        version: 2,
        committed_at: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a5CommitmentsScanned: 1,
        a5AlertsEmitted: 1,
        a5AlertsSkippedExisting: 0,
        a5Failures: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A5",
        subjectId: expect.not.stringMatching(orgId),
        payload: expect.objectContaining({
          year: 2026,
          commitment: "700.0000",
          projectedAvailable: "300.0000",
        }),
      }),
    ]);
  });

  it("emits separate A5 rows for separate active breached years", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
      [],
      [],
    ], [[
      { year: 2026, commitment: "500.0000", projected_available: "300.0000", status: "approved", version: 1, committed_at: new Date("2026-07-01T00:00:00.000Z") },
      { year: 2027, commitment: "600.0000", projected_available: "200.0000", status: "approved", version: 1, committed_at: new Date("2026-07-02T00:00:00.000Z") },
    ]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a5CommitmentsScanned: 2,
        a5AlertsEmitted: 2,
        a5AlertsSkippedExisting: 0,
        failures: [],
      });
    });

    const rows = insertedRows(fakeDb, alert);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.payload)).toEqual([
      expect.objectContaining({ year: 2026, projectedAvailable: "300.0000" }),
      expect.objectContaining({ year: 2027, projectedAvailable: "200.0000" }),
    ]);
    expect(new Set(rows.map((row) => row.subjectId))).toHaveProperty("size", 2);
    expect(rows.every((row) => row.subjectId !== orgId)).toBe(true);
  });

  it("does not re-alert for stale distributed or past A5 commitments", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
    ], [[
      {
        year: 2025,
        commitment: "700.0000",
        projected_available: "100.0000",
        source_kind: "share_out",
        status: "distributed",
        version: 1,
        committed_at: new Date("2025-12-31T00:00:00.000Z"),
      },
    ]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a5CommitmentsScanned: 0,
        a5AlertsEmitted: 0,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("uses projected available capital, not total projected balance, for A5", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeDb([
      [{ id: orgId }],
      [],
      [],
      [],
      [],
      [],
    ], [[
      {
        year: 2026,
        commitment: "500.0000",
        projected_available: "300.0000",
        projected_balance: "900.0000",
        status: "approved",
        version: 1,
        committed_at: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().emitSprint7DailyAlerts({
        today: new Date("2026-07-06T12:00:00.000Z"),
      })).resolves.toMatchObject({
        a5CommitmentsScanned: 1,
        a5AlertsEmitted: 1,
        failures: [],
      });
    });

    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A5",
        payload: expect.objectContaining({
          projectedAvailable: "300.0000",
          shortfall: "$200,00",
        }),
      }),
    ]);
  });

  it("lists only currently visible alerts and counts them", async () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const fakeDb = new FakeDb([
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          orgId: "11111111-1111-4111-8111-111111111111",
          alertKind: "loan_late",
          severity: "high",
          audience: "treasurer",
          subjectKind: "loan",
          subjectId: "22222222-2222-4222-8222-222222222222",
          payload: { title: "Préstamo atrasado", body: "Revisa el pago pendiente." },
          dedupWindowEnd: new Date("2026-07-10T00:00:00.000Z"),
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          orgId: "11111111-1111-4111-8111-111111111111",
          alertKind: "cash_drift",
          severity: "medium",
          audience: "both",
          subjectKind: "cash",
          subjectId: null,
          payload: { title: "Caja por revisar", body: "Hay una diferencia." },
          dedupWindowEnd: new Date("2026-07-10T00:00:00.000Z"),
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        },
      ],
      [
        {
          alertId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          actionKind: "dismiss",
          snoozedUntil: null,
          createdAt: new Date("2026-07-02T01:00:00.000Z"),
        },
      ],
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          orgId: "11111111-1111-4111-8111-111111111111",
          alertKind: "loan_late",
          severity: "high",
          audience: "treasurer",
          subjectKind: "loan",
          subjectId: "22222222-2222-4222-8222-222222222222",
          payload: { title: "Préstamo atrasado", body: "Revisa el pago pendiente." },
          dedupWindowEnd: new Date("2026-07-10T00:00:00.000Z"),
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        },
      ],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      const service = createDynamicAlertsService();
      await expect(service.listVisibleAlerts({
        orgId: "11111111-1111-4111-8111-111111111111",
        audience: "treasurer",
        now,
      })).resolves.toEqual([
        expect.objectContaining({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Préstamo atrasado",
          whatsAppText: "Mi Banquito: Préstamo atrasado. Revisa el pago pendiente.",
        }),
      ]);
      await expect(service.countVisibleAlerts({
        orgId: "11111111-1111-4111-8111-111111111111",
        audience: "treasurer",
        now,
      })).resolves.toBe(1);
    });
  });

  it("writes dismiss and snooze as append-only actions plus audit rows", async () => {
    const actionableAlert = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      orgId: "11111111-1111-4111-8111-111111111111",
      alertKind: "loan_late",
      severity: "high",
      audience: "treasurer",
      subjectKind: "loan",
      subjectId: "22222222-2222-4222-8222-222222222222",
      payload: { title: "Préstamo atrasado", body: "Revisa el pago pendiente." },
      dedupWindowEnd: new Date("2026-07-10T00:00:00.000Z"),
      createdAt: new Date("2026-07-02T00:00:00.000Z"),
    };
    const fakeDb = new FakeDb([[actionableAlert], [actionableAlert]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      const service = createDynamicAlertsService();
      await service.dismissAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        alertId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actorId: "33333333-3333-4333-8333-333333333333",
        audience: "treasurer",
      });
      await service.snoozeAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        alertId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actorId: "33333333-3333-4333-8333-333333333333",
        audience: "treasurer",
        snoozedUntil: new Date("2026-07-09T00:00:00.000Z"),
      });
    });

    expect(insertedRows(fakeDb, alertAction)).toEqual([
      expect.objectContaining({ actionKind: "dismiss", snoozedUntil: null }),
      expect.objectContaining({ actionKind: "snooze", snoozedUntil: new Date("2026-07-09T00:00:00.000Z") }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
      expect.objectContaining({ actionKind: "alert.dismiss" }),
      expect.objectContaining({ actionKind: "alert.snooze" }),
    ]);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("rejects actions for alerts outside the requested audience", async () => {
    const fakeDb = new FakeDb([[]]);

    await withMockedDb(fakeDb, async () => {
      const { createAlertsService: createDynamicAlertsService } = await import("./alerts");
      await expect(createDynamicAlertsService().dismissAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        alertId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actorId: "33333333-3333-4333-8333-333333333333",
        audience: "treasurer",
      })).rejects.toThrow("alert_not_actionable");
    });

    expect(insertedRows(fakeDb, alertAction)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });
});
