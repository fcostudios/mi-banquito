import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { alert, auditLogEntry, periodClose, reconciliationCycle } from "@mi-banquito/db/schema";

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
    const inserted = this.inserts.at(-1)?.values;
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return Promise.resolve([{ id: "77777777-7777-4777-8777-777777777777", ...row }]);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  private readonly selectResults: unknown[][];

  constructor(selectResults: unknown[][]) {
    this.selectResults = [...selectResults];
  }

  select() {
    return new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    const snapshot = [...this.inserts];
    try {
      return await callback(this);
    } catch (error) {
      this.inserts.splice(0, this.inserts.length, ...snapshot);
      throw error;
    }
  }
}

const insertedRows = (
  fakeDb: FakeDb,
  table: unknown,
): Array<Record<string, unknown>> => fakeDb.inserts
  .filter((entry) => entry.tableName === tableNameOf(table))
  .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);

const mockTenantDb = (fakeDb: FakeDb) => {
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) =>
      fakeDb.transaction(run),
  }));
};

const unmockTenantDb = () => {
  vi.doUnmock("@mi-banquito/db");
  vi.doUnmock("@mi-banquito/db/tenant");
  vi.resetModules();
};

describe("adjustment window reconciliation", () => {
  it("builds a default seven-day adjustment window", async () => {
    const { buildAdjustmentWindow } = await import("./reconciliation");
    const openedAt = new Date("2026-07-03T10:15:00.000Z");

    expect(buildAdjustmentWindow({ openedAt })).toEqual({
      opensAt: openedAt,
      closesAt: new Date("2026-07-10T10:15:00.000Z"),
    });
  });

  it("requires explicit confirmation and a non-empty reason before writing", async () => {
    const fakeDb = new FakeDb([]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      const service = createReconciliationService();

      await expect(service.openAdjustmentPeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        reason: "   ",
        confirmed: true,
      })).rejects.toThrow("reason is required");

      await expect(service.openAdjustmentPeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        reason: "Faltó un aporte del mes cerrado",
        confirmed: false,
      })).rejects.toThrow("confirmation is required");

      expect(fakeDb.inserts).toHaveLength(0);
    } finally {
      unmockTenantDb();
    }
  });

  it("inserts one adjustment cycle, one audit entry, and one alert in the same transaction", async () => {
    const openedAt = new Date("2026-07-03T10:15:00.000Z");
    const fakeDb = new FakeDb([
      [{
        id: "22222222-2222-4222-8222-222222222222",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      }],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await createReconciliationService({ now: () => openedAt }).openAdjustmentPeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        reason: "Faltó un aporte del mes cerrado",
        confirmed: true,
      });

      expect(insertedRows(fakeDb, reconciliationCycle)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          cycleId: "44444444-4444-4444-8444-444444444444",
          resolutionKind: "adjustment",
          periodCloseId: "22222222-2222-4222-8222-222222222222",
          adjustmentReason: "Faltó un aporte del mes cerrado",
          adjustmentWindowOpensAt: openedAt,
          adjustmentWindowClosesAt: new Date("2026-07-10T10:15:00.000Z"),
          createdBy: "33333333-3333-4333-8333-333333333333",
          createdByKind: "platform_operator",
        }),
      ]);

      expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          actorKind: "platform_operator",
          actorId: "33333333-3333-4333-8333-333333333333",
          actionKind: "adjustment_period.open",
          subjectKind: "period_close",
          subjectId: "22222222-2222-4222-8222-222222222222",
          reason: "Faltó un aporte del mes cerrado",
        }),
      ]);

      expect(insertedRows(fakeDb, alert)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          alertKind: "adjustment_period_opened",
          severity: "low",
          audience: "both",
          subjectKind: "period_close",
          subjectId: "22222222-2222-4222-8222-222222222222",
          createdAt: openedAt,
        }),
      ]);
    } finally {
      unmockTenantDb();
    }
  });

  it("rolls back the cycle and alert when the audit write fails", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "22222222-2222-4222-8222-222222222222",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      }],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService({
        auditWriter: async () => {
          throw new Error("audit unavailable");
        },
      }).openAdjustmentPeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        reason: "Faltó un aporte del mes cerrado",
        confirmed: true,
      })).rejects.toThrow("audit unavailable");

      expect(insertedRows(fakeDb, reconciliationCycle)).toHaveLength(0);
      expect(insertedRows(fakeDb, alert)).toHaveLength(0);
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
    } finally {
      unmockTenantDb();
    }
  });

  it("returns an existing adjustment period without duplicate alert or audit rows", async () => {
    const existingAdjustment = {
      id: "77777777-7777-4777-8777-777777777777",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      resolutionKind: "adjustment",
      periodCloseId: "22222222-2222-4222-8222-222222222222",
      adjustmentWindowOpensAt: new Date("2026-07-03T10:15:00.000Z"),
      adjustmentWindowClosesAt: new Date("2026-07-10T10:15:00.000Z"),
    };
    const fakeDb = new FakeDb([
      [{
        id: "22222222-2222-4222-8222-222222222222",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      }],
      [existingAdjustment],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService().openAdjustmentPeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        actorId: "33333333-3333-4333-8333-333333333333",
        reason: "Faltó un aporte del mes cerrado",
        confirmed: true,
      })).resolves.toMatchObject(existingAdjustment);

      expect(fakeDb.inserts).toHaveLength(0);
    } finally {
      unmockTenantDb();
    }
  });
});
