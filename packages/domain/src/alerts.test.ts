import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { alert, alertAction, auditLogEntry } from "@mi-banquito/db/schema";

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

  constructor(selectResults: unknown[][] = []) {
    this.selectResults = [...selectResults];
  }

  select() {
    return new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
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
