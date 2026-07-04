import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  alert,
  auditLogEntry,
  entityVersion,
  groupConfig,
  member,
  organization,
  treasurerCompensationDisbursement,
  withdrawal,
} from "@mi-banquito/db/schema";
import {
  createCompensationService,
  nextCompensationDueOn,
  periodLabelForCompensation,
  shouldAwardFixedPeriodicCompensation,
} from "./compensation";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type UpdateRecord = {
  tableName: string;
  values: Record<string, unknown>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeSelectBuilder {
  private tableName = "";

  constructor(private readonly nextResult: (tableName: string) => unknown[]) {}

  from(table: unknown) {
    this.tableName = tableNameOf(table);
    return this;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.nextResult(this.tableName)).then(onfulfilled, onrejected);
  }
}

class FakeInsertBuilder {
  private inserted: Record<string, unknown> | Array<Record<string, unknown>> | null = null;

  constructor(
    private readonly table: unknown,
    private readonly inserts: InsertRecord[],
    private readonly nextReturning: (tableName: string, inserted: Record<string, unknown> | Array<Record<string, unknown>>) => unknown[],
  ) {}

  values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.inserted = values;
    this.inserts.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  onConflictDoNothing() {
    return this;
  }

  returning() {
    return Promise.resolve(this.nextReturning(tableNameOf(this.table), this.inserted ?? {}));
  }
}

class FakeUpdateBuilder {
  constructor(private readonly table: unknown, private readonly updates: UpdateRecord[]) {}

  set(values: Record<string, unknown>) {
    this.updates.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  where() {
    return Promise.resolve([]);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: UpdateRecord[] = [];
  readonly selects: string[] = [];
  private readonly selectResultsByTableName: Record<string, unknown[][]>;
  private readonly insertReturningByTableName: Record<string, unknown[][]>;

  constructor(
    selectResultsByTableName: Record<string, unknown[][]> = {},
    insertReturningByTableName: Record<string, unknown[][]> = {},
  ) {
    this.selectResultsByTableName = { ...selectResultsByTableName };
    this.insertReturningByTableName = { ...insertReturningByTableName };
  }

  select() {
    return new FakeSelectBuilder((tableName) => {
      this.selects.push(tableName);
      return this.selectResultsByTableName[tableName]?.shift() ?? [];
    });
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts, (tableName, inserted) => {
      const queued = this.insertReturningByTableName[tableName]?.shift();
      if (queued) {
        return queued;
      }
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return row ? [row] : [];
    });
  }

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates);
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function insertedRows(fakeDb: FakeDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.inserts
    .filter((entry) => entry.tableName === tableNameOf(table))
    .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);
}

function updatedRows(fakeDb: FakeDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.updates
    .filter((entry) => entry.tableName === tableNameOf(table))
    .map((entry) => entry.values);
}

async function withMockedCompensationDb<T>(
  input: {
    systemDb: FakeDb;
    tenantDbs?: Record<string, FakeDb>;
    tenantCalls?: string[];
  },
  callback: () => Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.doMock("@mi-banquito/db", () => ({ db: input.systemDb }));
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withTenantTransaction: async <R>(orgId: string, run: (tx: FakeDb) => Promise<R>): Promise<R> => {
      input.tenantCalls?.push(orgId);
      return run(input.tenantDbs?.[orgId] ?? input.systemDb);
    },
  }));
  try {
    return await callback();
  } finally {
    vi.doUnmock("@mi-banquito/db");
    vi.doUnmock("@mi-banquito/db/tenant");
    vi.resetModules();
  }
}

const dueConfig = {
  id: "10000000-0000-4000-8000-000000000001",
  orgId: "20000000-0000-4000-8000-000000000001",
  version: 3,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: null,
  contributionCycleKind: "monthly",
  contributionAmount: "20.0000",
  currencyCode: "USD",
  loanRateModel: "declining_balance",
  loanRateValue: "3.0000",
  loanRatePeriodUnit: "monthly",
  loanGracePeriods: 0,
  loanToSavingsCapRatio: "2.00",
  interestResolution: "daily",
  repaymentSplitRule: "interest_first",
  paysSavingsInterest: true,
  savingsInterestRate: "0.0000",
  yearEndShareOutFormula: "time_weighted",
  safetyMarginAmount: "0.0000",
  reconciliationToleranceAmount: "0.0100",
  lateThresholdDays: 5,
  moraThresholdDays: 10,
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  config: {
    treasurerCompensation: {
      kind: "fixed",
      amount: "10.0000",
      currency: "USD",
      period: "monthly",
      nextDueOn: "2026-07-01",
    },
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  createdBy: "30000000-0000-4000-8000-000000000001",
  createdByKind: "platform_operator",
};

describe("treasurer compensation", () => {
  it("advances monthly and yearly due dates with calendar clamping", () => {
    expect(nextCompensationDueOn("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextCompensationDueOn("2024-02-29", "yearly")).toBe("2025-02-28");
  });

  it("labels compensation periods from the due date", () => {
    expect(periodLabelForCompensation("2026-07-01", "monthly")).toBe("2026-07");
    expect(periodLabelForCompensation("2026-07-01", "yearly")).toBe("2026");
  });

  it("only awards fixed periodic compensation when nextDueOn is due", () => {
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(true);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "pct_of_interest",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "weekly",
      nextDueOn: "2026-07-01",
    }, "2026-07-04")).toBe(false);
    expect(shouldAwardFixedPeriodicCompensation({
      kind: "fixed",
      amount: "10.0000",
      period: "monthly",
      nextDueOn: "2026-07-10",
    }, "2026-07-04")).toBe(false);
  });

  it("awards due fixed compensation once and advances the current config", async () => {
    const tenantCalls: string[] = [];
    const systemDb = new FakeDb({
      [tableNameOf(organization)]: [[{ id: dueConfig.orgId, status: "active" }]],
    });
    const tenantDb = new FakeDb({
      [tableNameOf(groupConfig)]: [[dueConfig]],
      [tableNameOf(member)]: [[{
        id: "40000000-0000-4000-8000-000000000001",
        orgId: dueConfig.orgId,
        role: "tesorera",
        status: "activo",
      }]],
    });

    await withMockedCompensationDb({
      systemDb,
      tenantDbs: { [dueConfig.orgId]: tenantDb },
      tenantCalls,
    }, async () => {
      const { createCompensationService: createDynamicService } = await import("./compensation");

      const result = await createDynamicService({
        now: () => new Date("2026-07-04T10:15:00.000Z"),
      }).awardDueTreasurerCompensation("2026-07-04");

      expect(result).toMatchObject({
        orgsProcessed: 1,
        configsScanned: 1,
        dueConfigs: 1,
        disbursementsAwarded: 1,
        skippedExistingDisbursements: 0,
        configsAdvanced: 1,
        failures: [],
      });
    });

    expect(systemDb.selects).toEqual([tableNameOf(organization)]);
    expect(tenantCalls).toEqual([dueConfig.orgId]);
    expect(tenantDb.selects).toEqual([tableNameOf(groupConfig), tableNameOf(member)]);
    expect(insertedRows(tenantDb, treasurerCompensationDisbursement)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        memberId: "40000000-0000-4000-8000-000000000001",
        periodLabel: "2026-07",
        amount: "10.0000",
        currencyCode: "USD",
        kindAtDisbursement: dueConfig.config.treasurerCompensation,
        withdrawalId: null,
        disbursedOn: "2026-07-04",
      }),
    ]);
    expect(insertedRows(tenantDb, withdrawal)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        memberId: "40000000-0000-4000-8000-000000000001",
        kind: "treasurer_compensation_disbursement",
        amount: "10.0000",
        currencyCode: "USD",
        datedOn: "2026-07-04",
        createdByKind: "system",
      }),
    ]);
    expect(insertedRows(tenantDb, alert)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        alertKind: "treasurer_compensation_disbursed",
        severity: "low",
        audience: "treasurer",
        payload: expect.objectContaining({
          periodLabel: "2026-07",
          message: "Compensación de tesorera de 2026-07 acreditada — USD 10.0000",
        }),
      }),
    ]);
    expect(insertedRows(tenantDb, auditLogEntry)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        actorKind: "system",
        actionKind: "treasurer_compensation.disbursed",
        subjectKind: "treasurer_compensation_disbursement",
      }),
    ]);
    expect(updatedRows(tenantDb, treasurerCompensationDisbursement)).toEqual([
      expect.objectContaining({ withdrawalId: expect.any(String) }),
    ]);
    expect(updatedRows(tenantDb, groupConfig)).toEqual([
      expect.objectContaining({ validTo: new Date("2026-07-04T10:15:00.000Z") }),
    ]);
    expect(insertedRows(tenantDb, groupConfig)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        version: 4,
        validTo: null,
        config: expect.objectContaining({
          treasurerCompensation: expect.objectContaining({
            nextDueOn: "2026-08-01",
          }),
        }),
      }),
    ]);
    expect(updatedRows(tenantDb, entityVersion)).toEqual([]);
    expect(insertedRows(tenantDb, entityVersion)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        entityKind: "GroupConfig",
        version: 4,
        validTo: null,
        changeKind: "update",
        changeReason: "treasurer_compensation_next_due_on_advanced",
        createdByKind: "system",
      }),
    ]);
  });

  it("advances the due config without duplicate side effects when the period was already disbursed", async () => {
    const systemDb = new FakeDb({
      [tableNameOf(organization)]: [[{ id: dueConfig.orgId, status: "active" }]],
    });
    const tenantDb = new FakeDb({
      [tableNameOf(groupConfig)]: [[dueConfig]],
      [tableNameOf(member)]: [[{
        id: "40000000-0000-4000-8000-000000000001",
        orgId: dueConfig.orgId,
        role: "tesorera",
        status: "activo",
      }]],
    }, {
      [tableNameOf(treasurerCompensationDisbursement)]: [[]],
    });

    await withMockedCompensationDb({
      systemDb,
      tenantDbs: { [dueConfig.orgId]: tenantDb },
    }, async () => {
      const { createCompensationService: createDynamicService } = await import("./compensation");

      const result = await createDynamicService().awardDueTreasurerCompensation("2026-07-04");

      expect(result).toMatchObject({
        orgsProcessed: 1,
        configsScanned: 1,
        dueConfigs: 1,
        disbursementsAwarded: 0,
        skippedExistingDisbursements: 1,
        configsAdvanced: 1,
      });
    });

    expect(systemDb.selects).toEqual([tableNameOf(organization)]);
    expect(insertedRows(tenantDb, withdrawal)).toEqual([]);
    expect(insertedRows(tenantDb, alert)).toEqual([]);
    expect(insertedRows(tenantDb, auditLogEntry)).toEqual([]);
    expect(updatedRows(tenantDb, groupConfig)).toEqual([
      expect.objectContaining({ validTo: expect.any(Date) }),
    ]);
    expect(insertedRows(tenantDb, groupConfig)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        version: 4,
        validTo: null,
        config: expect.objectContaining({
          treasurerCompensation: expect.objectContaining({
            nextDueOn: "2026-08-01",
          }),
        }),
      }),
    ]);
    expect(updatedRows(tenantDb, entityVersion)).toEqual([]);
    expect(insertedRows(tenantDb, entityVersion)).toEqual([
      expect.objectContaining({
        orgId: dueConfig.orgId,
        entityKind: "GroupConfig",
        version: 4,
        validTo: null,
      }),
    ]);
  });
});
