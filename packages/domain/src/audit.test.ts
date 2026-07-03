import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  auditLogEntry,
  baseFundQuotaConfig,
  contribution,
  contributionCycle,
  entityVersion,
  groupConfig,
  loanSchedule,
  member,
  organization,
  repayment,
} from "@mi-banquito/db/schema";
import { AuditWriteFailure, createAuditFailure, writeWithAudit } from "./audit";

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
    return Promise.resolve([{ id: "99999999-9999-4999-8999-999999999999", ...row }]);
  }

  onConflictDoUpdate() {
    return this;
  }
}

class FakeUpdateBuilder {
  constructor(
    private readonly table: unknown,
    private readonly updates: UpdateRecord[],
  ) {}

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
  readonly executedSql: string[] = [];
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

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates);
  }

  execute(query: unknown) {
    this.executedSql.push(String(query));
    return Promise.resolve([]);
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    const insertCount = this.inserts.length;
    const updateCount = this.updates.length;
    const executeCount = this.executedSql.length;
    try {
      return await callback(this);
    } catch (error) {
      this.inserts.length = insertCount;
      this.updates.length = updateCount;
      this.executedSql.length = executeCount;
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

const updatedRows = (
  fakeDb: FakeDb,
  table: unknown,
): Array<Record<string, unknown>> => fakeDb.updates
  .filter((entry) => entry.tableName === tableNameOf(table))
  .map((entry) => entry.values);

const expectAuditFailure = async (operation: Promise<unknown>, AuditFailure: typeof AuditWriteFailure) => {
  let thrown: unknown;
  try {
    await operation;
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AuditFailure);
};

const withMockedDb = async <T>(fakeDb: FakeDb, callback: () => Promise<T>): Promise<T> => {
  vi.resetModules();
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  try {
    return await callback();
  } finally {
    vi.doUnmock("@mi-banquito/db");
    vi.resetModules();
  }
};

const failingAuditWriter = async () => {
  throw new Error("audit down");
};

const groupConfigForm = {
  contributionCycleKind: "monthly",
  contributionAmount: "25",
  memberLoanRateValue: "4",
  loanRateModel: "declining_balance",
  loanRatePeriodUnit: "monthly",
  loanGracePeriods: 0,
  loanToSavingsCapRatio: "3",
  lateThresholdDays: 3,
  moraThresholdDays: 15,
  yearEndShareOutFormula: "proportional_time_weighted",
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  reconciliationToleranceAmount: "1",
  baseFundQuotaFiscalYear: 2026,
  baseFundQuotaAmount: "25",
  nonMemberLoanRateValue: "5",
  adminFeePct: "1",
  referralCommissionAmount: "5",
  treasurerCompensationKind: "fixed",
  treasurerCompensationAmount: "10",
  treasurerCompensationPeriod: "monthly",
  opensOnDay: 1,
} as const;

describe("audit atomicity", () => {
  it("runs the write first and propagates audit failures", async () => {
    const calls: string[] = [];
    const failure = createAuditFailure("audit unavailable");

    await expect(writeWithAudit({
      write: async () => {
        calls.push("write");
        return "written";
      },
      audit: async () => {
        calls.push("audit");
        throw failure;
      },
    })).rejects.toBe(failure);

    expect(calls).toEqual(["write", "audit"]);
    expect(failure).toBeInstanceOf(AuditWriteFailure);
  });

  it("rolls back a contribution when audit writing fails", async () => {
    const fakeDb = new FakeDb([
      [],
      [],
      [{ contributionAmount: "10.0000" }],
    ]);

    await withMockedDb(fakeDb, async () => {
      const [{ createLedgerService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./ledger"),
        import("./audit"),
      ]);

      await expectAuditFailure(createLedgerService({ auditWriter: failingAuditWriter }).recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "44444444-4444-4444-8444-444444444444",
          memberId: "55555555-5555-4555-8555-555555555555",
          amount: "10.0000",
          datedOn: "2026-07-01",
          paymentSource: "cash_in_meeting",
          kind: "partial",
          slipPhotoId: "",
        },
      ), DynamicAuditWriteFailure);
    });

    expect(insertedRows(fakeDb, contributionCycle)).toHaveLength(0);
    expect(insertedRows(fakeDb, contribution)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
    expect(fakeDb.executedSql).toHaveLength(0);
  });

  it("rolls back member creation when audit writing fails", async () => {
    const fakeDb = new FakeDb();

    await withMockedDb(fakeDb, async () => {
      const [{ createLedgerService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./ledger"),
        import("./audit"),
      ]);

      await expectAuditFailure(createLedgerService({ auditWriter: failingAuditWriter }).createMemberWithAudit(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          displayName: "Ana Mora",
          whatsappNumber: "+593999999999",
          joinedOn: "2026-07-01",
          role: "aportante",
          initialSavingsBalance: "0",
          notes: "",
        },
      ), DynamicAuditWriteFailure);
    });

    expect(insertedRows(fakeDb, member)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("rolls back first-run updates when audit writing fails", async () => {
    const fakeDb = new FakeDb();

    await withMockedDb(fakeDb, async () => {
      const [{ createLedgerService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./ledger"),
        import("./audit"),
      ]);

      await expectAuditFailure(createLedgerService({ auditWriter: failingAuditWriter }).saveFirstRunName(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        { displayName: "Mi Banquito", brandingLogoUri: "", nextStep: "rules" },
      ), DynamicAuditWriteFailure);
    });

    expect(updatedRows(fakeDb, organization)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("rolls back member status transitions when audit writing fails", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        displayName: "Ana Mora",
        status: "activo",
        initialSavingsBalance: "10.0000",
      }],
      [{ version: 3 }],
    ]);

    await withMockedDb(fakeDb, async () => {
      const [{ createLedgerService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./ledger"),
        import("./audit"),
      ]);

      await expectAuditFailure(createLedgerService({ auditWriter: failingAuditWriter }).transitionMemberStatus(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          memberId: "55555555-5555-4555-8555-555555555555",
          nextStatus: "en_pausa",
          reason: "Viaje temporal",
        },
      ), DynamicAuditWriteFailure);
    });

    expect(updatedRows(fakeDb, member)).toHaveLength(0);
    expect(insertedRows(fakeDb, entityVersion)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("rolls back group-config writes when audit writing fails", async () => {
    const fakeDb = new FakeDb([[]]);

    await withMockedDb(fakeDb, async () => {
      const [{ createPlatformService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./platform"),
        import("./audit"),
      ]);

      await expectAuditFailure(createPlatformService({ auditWriter: failingAuditWriter }).saveGroupConfig(
        "11111111-1111-4111-8111-111111111111",
        groupConfigForm,
        "22222222-2222-4222-8222-222222222222",
        "platform_operator",
      ), DynamicAuditWriteFailure);
    });

    expect(insertedRows(fakeDb, groupConfig)).toHaveLength(0);
    expect(insertedRows(fakeDb, baseFundQuotaConfig)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("rolls back organization creation when audit writing fails", async () => {
    const fakeDb = new FakeDb();
    const auth0 = {
      createOrganization: vi.fn(async () => ({ auth0OrgId: "auth0-org-1" })),
    };

    await withMockedDb(fakeDb, async () => {
      const [{ createPlatformService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./platform"),
        import("./audit"),
      ]);

      await expectAuditFailure(createPlatformService({ auditWriter: failingAuditWriter }).createOrganization(
        {
          displayName: "Mi Banquito",
          countryCode: "EC",
          currencyCode: "USD",
          timezone: "America/Guayaquil",
          defaultLanguage: "es",
          brandingLogoUri: "",
        },
        "22222222-2222-4222-8222-222222222222",
        auth0,
      ), DynamicAuditWriteFailure);
    });

    expect(auth0.createOrganization).not.toHaveBeenCalled();
    expect(insertedRows(fakeDb, organization)).toHaveLength(0);
    expect(insertedRows(fakeDb, groupConfig)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });

  it("rolls back repayment writes when audit writing fails", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: "11111111-1111-4111-8111-111111111111",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        principalAmount: "100.0000",
        currencyCode: "USD",
        status: "activo",
      }],
      [],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orgId: "11111111-1111-4111-8111-111111111111",
        loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        periodIndex: 1,
        dueOn: "2026-08-02",
        principalDue: "10.0000",
        interestDue: "5.0000",
        paidPrincipalToDate: "0.0000",
        paidInterestToDate: "0.0000",
        status: "pendiente",
      }],
      [],
      [],
      [{ displayName: "Ana Mora" }],
    ]);

    await withMockedDb(fakeDb, async () => {
      const [{ createLoanService }, { AuditWriteFailure: DynamicAuditWriteFailure }] = await Promise.all([
        import("./loan"),
        import("./audit"),
      ]);

      await expectAuditFailure(createLoanService({ auditWriter: failingAuditWriter }).recordRepayment({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: "15.0000",
        datedOn: "2026-07-02",
      }), DynamicAuditWriteFailure);
    });

    expect(insertedRows(fakeDb, repayment)).toHaveLength(0);
    expect(updatedRows(fakeDb, loanSchedule)).toHaveLength(0);
    expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
  });
});
