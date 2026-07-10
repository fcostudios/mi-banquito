import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  auditLogEntry,
  contribution,
  groupConfig,
  loanSchedule,
  paymentAllocation,
  paymentReceipt,
  repayment,
} from "@mi-banquito/db/schema";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type SelectRecord = {
  tableName: string;
  inTransaction: boolean;
};

type UpdateRecord = {
  tableName: string;
  values: Record<string, unknown>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeSelectBuilder {
  private tableName = "unknown";

  constructor(
    private readonly nextResult: (tableName: string) => unknown[],
    private readonly logSelect: (tableName: string) => void,
  ) {}

  from(table: unknown) {
    this.tableName = tableNameOf(table);
    this.logSelect(this.tableName);
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
    return Promise.resolve(this.nextResult(this.tableName)).then(onfulfilled, onrejected);
  }
}

class FakeInsertBuilder {
  private pendingValues: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
  private ignoreConflict = false;
  private committed = false;

  constructor(
    private readonly table: unknown,
    private readonly db: FakeDb,
  ) {}

  values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.pendingValues = values;
    return this;
  }

  onConflictDoNothing() {
    this.ignoreConflict = true;
    return this;
  }

  returning() {
    const inserted = this.commit();
    if (!inserted) {
      return Promise.resolve([]);
    }

    const firstValue = Array.isArray(this.pendingValues) ? this.pendingValues[0] : this.pendingValues;
    return Promise.resolve(firstValue ? [{ id: firstValue.id }] : []);
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const inserted = this.commit();
    return Promise.resolve(inserted ? [] : []).then(onfulfilled, onrejected);
  }

  private commit(): boolean {
    if (this.committed) {
      return false;
    }
    this.committed = true;

    const tableName = tableNameOf(this.table);
    if (this.db.conflictingInsertTables.has(tableName)) {
      if (this.ignoreConflict) {
        return false;
      }

      const error = new Error("duplicate key value violates unique constraint");
      (error as Error & { code?: string }).code = "23505";
      throw error;
    }

    if (this.pendingValues) {
      this.db.inserts.push({ tableName, values: this.pendingValues });
    }
    return true;
  }
}

class FakeUpdateBuilder {
  private pendingValues: Record<string, unknown> | null = null;

  constructor(
    private readonly table: unknown,
    private readonly updates: UpdateRecord[],
  ) {}

  set(values: Record<string, unknown>) {
    this.pendingValues = values;
    return this;
  }

  where() {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    if (this.pendingValues) {
      this.updates.push({ tableName: tableNameOf(this.table), values: this.pendingValues });
    }
    return Promise.resolve([]).then(onfulfilled, onrejected);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: UpdateRecord[] = [];
  readonly selects: SelectRecord[] = [];
  readonly executedSql: string[] = [];
  readonly conflictingInsertTables: Set<string>;
  private inTransaction = false;
  private readonly selectResults: unknown[][];

  constructor(selectResults: unknown[][], options?: { conflictingInsertTables?: string[] }) {
    this.selectResults = [...selectResults];
    this.conflictingInsertTables = new Set(options?.conflictingInsertTables ?? []);
  }

  select() {
    return new FakeSelectBuilder(
      () => this.selectResults.shift() ?? [],
      (tableName) => {
        this.selects.push({ tableName, inTransaction: this.inTransaction });
      },
    );
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this);
  }

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates);
  }

  execute(query: unknown) {
    const queryText = String(query);
    this.executedSql.push(queryText === "[object Object]" ? "SELECT refresh_sprint1_read_models()" : queryText);
    return Promise.resolve([]);
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    this.inTransaction = true;
    try {
      return await callback(this);
    } finally {
      this.inTransaction = false;
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

const withMockedDb = async <T>(fakeDb: FakeDb, callback: () => Promise<T>): Promise<T> => {
  vi.resetModules();
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<T>) => fakeDb.transaction(() => run(fakeDb)),
  }));
  try {
    return await callback();
  } finally {
    vi.doUnmock("@mi-banquito/db");
    vi.doUnmock("@mi-banquito/db/tenant");
    vi.resetModules();
  }
};

const recordInput = {
  orgId: "11111111-1111-4111-8111-111111111111",
  actorId: "33333333-3333-4333-8333-333333333333",
  clientRequestId: "44444444-4444-4444-8444-444444444444",
  memberId: "22222222-2222-4222-8222-222222222222",
  amount: "85.0000",
  datedOn: "2026-07-09",
  paymentSource: "cash_in_meeting" as const,
  slipPhotoId: "",
  notes: "meeting payment",
};

describe("BR-26 payment service", () => {
  it("persists one receipt with repayment, contribution, allocation, audit, and refresh rows", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orgId: recordInput.orgId,
        borrowerMemberId: recordInput.memberId,
        principalAmount: "100.0000",
        currencyCode: "USD",
        status: "activo",
      }],
      [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        orgId: recordInput.orgId,
        loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        dueOn: "2026-06-30",
        principalDue: "30.0000",
        interestDue: "10.0000",
        paidPrincipalToDate: "0.0000",
        paidInterestToDate: "0.0000",
        status: "pendiente",
      }],
      [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        orgId: recordInput.orgId,
        loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        loanScheduleId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        amount: "5.0000",
        datedOn: "2026-06-30",
      }],
      [],
      [
        {
          orgId: recordInput.orgId,
          memberId: recordInput.memberId,
          reasonKind: "contribution_overdue",
          cycleId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          periodLabel: "2026-06",
          dueDate: "2026-06-30",
          amountDue: "20.0000",
        },
        {
          orgId: recordInput.orgId,
          memberId: recordInput.memberId,
          reasonKind: "contribution_current",
          cycleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          periodLabel: "2026-07",
          dueDate: "2026-07-31",
          amountDue: "20.0000",
        },
      ],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().recordMemberPayment(recordInput);

      expect(result.allocations.map((line) => line.kind)).toEqual([
        "loan_fee",
        "loan_interest",
        "loan_principal",
        "contribution_overdue",
        "contribution_current",
      ]);
      expect(insertedRows(fakeDb, paymentReceipt)).toHaveLength(1);
      expect(insertedRows(fakeDb, paymentAllocation)).toHaveLength(5);
      expect(insertedRows(fakeDb, repayment)).toHaveLength(1);
      expect(insertedRows(fakeDb, contribution)).toHaveLength(2);
      expect(updatedRows(fakeDb, loanSchedule)).toContainEqual({
        paidPrincipalToDate: "30.0000",
        paidInterestToDate: "10.0000",
        status: "pagado",
      });
      expect(insertedRows(fakeDb, auditLogEntry)[0]).toMatchObject({
        actionKind: "payment.receipt.recorded",
        subjectKind: "payment_receipt",
      });
      expect(fakeDb.executedSql.filter((query) => query.includes("refresh_sprint1_read_models"))).toHaveLength(1);
      expect(fakeDb.selects.filter((entry) => entry.tableName === tableNameOf(groupConfig))).toEqual([
        { tableName: tableNameOf(groupConfig), inTransaction: true },
      ]);
    });
  });

  it("returns an existing receipt for the same client request without duplicate child inserts", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "existing-receipt-id",
        orgId: recordInput.orgId,
        memberId: recordInput.memberId,
        amount: recordInput.amount,
        currencyCode: "USD",
        datedOn: recordInput.datedOn,
        clientRequestId: recordInput.clientRequestId,
      }],
      [{
        allocationKind: "contribution_current",
        amount: "20.0000",
        sortOrder: 1,
        currencyCode: "USD",
        brId: "BR-26",
        groupConfigVersion: 7,
        cycleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      }],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().recordMemberPayment(recordInput);

      expect(result.receiptId).toBe("existing-receipt-id");
      expect(fakeDb.inserts).toHaveLength(0);
      expect(insertedRows(fakeDb, paymentReceipt)).toHaveLength(0);
      expect(insertedRows(fakeDb, paymentAllocation)).toHaveLength(0);
      expect(insertedRows(fakeDb, repayment)).toHaveLength(0);
      expect(insertedRows(fakeDb, contribution)).toHaveLength(0);
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
    });
  });

  it("throws when a persisted payment still requires an extra decision", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      await expect(createPaymentService().recordMemberPayment(recordInput))
        .rejects.toThrow("payment_extra_decision_required");
      expect(fakeDb.inserts).toHaveLength(0);
    });
  });

  it("persists extra savings in the current cycle without a target cycle", async () => {
    const currentCycleId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [],
      [],
      [],
      [],
      [{
        orgId: recordInput.orgId,
        memberId: recordInput.memberId,
        reasonKind: "contribution_current",
        cycleId: currentCycleId,
        periodLabel: "2026-07",
        dueDate: "2026-07-31",
        amountDue: "20.0000",
      }],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().recordMemberPayment({
        ...recordInput,
        amount: "25.0000",
        extraDecision: "extra_savings",
      });

      expect(result.allocations.map((line) => [line.kind, line.amount])).toEqual([
        ["contribution_current", "20.0000"],
        ["extra_savings", "5.0000"],
      ]);
      expect(insertedRows(fakeDb, contribution).map((row) => row.cycleId)).toEqual([
        currentCycleId,
        currentCycleId,
      ]);
      expect(insertedRows(fakeDb, paymentAllocation).at(-1)).toMatchObject({
        allocationKind: "extra_savings",
        cycleId: currentCycleId,
      });
    });
  });

  it("applies extra principal only to the targeted loan when older loans also have prepayable capacity", async () => {
    const olderLoanId = "aaaaaaaa-0000-4000-8000-000000000001";
    const targetLoanId = "bbbbbbbb-0000-4000-8000-000000000002";
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [
        {
          id: olderLoanId,
          orgId: recordInput.orgId,
          borrowerMemberId: recordInput.memberId,
          principalAmount: "100.0000",
          currencyCode: "USD",
          status: "activo",
        },
        {
          id: targetLoanId,
          orgId: recordInput.orgId,
          borrowerMemberId: recordInput.memberId,
          principalAmount: "100.0000",
          currencyCode: "USD",
          status: "activo",
        },
      ],
      [
        {
          id: "cccccccc-0000-4000-8000-000000000001",
          orgId: recordInput.orgId,
          loanId: olderLoanId,
          dueOn: "2026-06-30",
          principalDue: "10.0000",
          interestDue: "0.0000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
        {
          id: "dddddddd-0000-4000-8000-000000000002",
          orgId: recordInput.orgId,
          loanId: targetLoanId,
          dueOn: "2026-07-09",
          principalDue: "10.0000",
          interestDue: "0.0000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
      ],
      [],
      [],
      [],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().recordMemberPayment({
        ...recordInput,
        amount: "50.0000",
        targetLoanId,
        extraDecision: "loan_principal",
      });

      expect(result.requiresExtraDecision).toBe(false);
      expect(result.unappliedAmount).toBe("0.0000");
      expect(result.allocations.filter((line) => line.kind === "loan_principal")).toEqual([
        expect.objectContaining({ loanId: olderLoanId, amount: "10.0000" }),
        expect.objectContaining({ loanId: targetLoanId, amount: "10.0000" }),
        expect.objectContaining({ loanId: targetLoanId, amount: "30.0000" }),
      ]);
      expect(result.allocations).not.toContainEqual(expect.objectContaining({
        kind: "loan_principal",
        loanId: olderLoanId,
        amount: "30.0000",
      }));
      expect(insertedRows(fakeDb, repayment).map((row) => [row.loanId, row.appliedToPrincipal])).toEqual([
        [olderLoanId, "10.0000"],
        [targetLoanId, "40.0000"],
      ]);
    });
  });

  it("fails closed when extra principal is requested without a target loan", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      await expect(createPaymentService().recordMemberPayment({
        ...recordInput,
        amount: "50.0000",
        extraDecision: "loan_principal",
      })).rejects.toThrow("payment_target_loan_required_for_principal_prepayment");
    });
  });

  it("returns the existing receipt without child inserts when the receipt insert conflicts", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [],
      [],
      [],
      [],
      [{
        orgId: recordInput.orgId,
        memberId: recordInput.memberId,
        reasonKind: "contribution_current",
        cycleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        periodLabel: "2026-07",
        dueDate: "2026-07-31",
        amountDue: "20.0000",
      }],
      [],
      [{
        id: "existing-receipt-id",
        orgId: recordInput.orgId,
        memberId: recordInput.memberId,
        amount: recordInput.amount,
        currencyCode: "USD",
        datedOn: recordInput.datedOn,
        clientRequestId: recordInput.clientRequestId,
      }],
      [{
        allocationKind: "contribution_current",
        amount: "20.0000",
        sortOrder: 1,
        currencyCode: "USD",
        brId: "BR-26",
        groupConfigVersion: 7,
        cycleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      }],
    ], { conflictingInsertTables: [tableNameOf(paymentReceipt)] });

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().recordMemberPayment({
        ...recordInput,
        amount: "20.0000",
      });

      expect(result.receiptId).toBe("existing-receipt-id");
      expect(fakeDb.inserts).toHaveLength(0);
      expect(insertedRows(fakeDb, paymentAllocation)).toHaveLength(0);
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(0);
    });
  });

  it("does not duplicate extra prepayable principal across due schedules for one loan", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: recordInput.orgId,
        version: 7,
        contributionAmount: "20.0000",
        currencyCode: "USD",
      }],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        orgId: recordInput.orgId,
        borrowerMemberId: recordInput.memberId,
        principalAmount: "100.0000",
        currencyCode: "USD",
        status: "activo",
      }],
      [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          orgId: recordInput.orgId,
          loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-06-30",
          principalDue: "10.0000",
          interestDue: "0.0000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          orgId: recordInput.orgId,
          loanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueOn: "2026-07-09",
          principalDue: "10.0000",
          interestDue: "0.0000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
      ],
      [],
      [],
      [],
      [],
    ]);

    await withMockedDb(fakeDb, async () => {
      const { createPaymentService } = await import("./payments");

      const result = await createPaymentService().previewMemberPayment({
        ...recordInput,
        amount: "120.0000",
        targetLoanId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        extraDecision: "loan_principal",
      });

      const principalAllocated = result.allocations
        .filter((line) => line.kind === "loan_principal")
        .reduce((total, line) => total + Number(line.amount), 0);
      expect(principalAllocated).toBe(100);
      expect(result.unappliedAmount).toBe("20.0000");
      expect(result.requiresExtraDecision).toBe(true);
    });
  });
});
