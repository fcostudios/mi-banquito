import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  auditLogEntry,
  contribution,
  paymentAllocation,
  paymentReceipt,
  repayment,
} from "@mi-banquito/db/schema";

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
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly executedSql: string[] = [];
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

  execute(query: unknown) {
    const queryText = String(query);
    this.executedSql.push(queryText === "[object Object]" ? "SELECT refresh_sprint1_read_models()" : queryText);
    return Promise.resolve([]);
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const insertedRows = (
  fakeDb: FakeDb,
  table: unknown,
): Array<Record<string, unknown>> => fakeDb.inserts
  .filter((entry) => entry.tableName === tableNameOf(table))
  .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);

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
      expect(insertedRows(fakeDb, auditLogEntry)[0]).toMatchObject({
        actionKind: "payment.receipt.recorded",
        subjectKind: "payment_receipt",
      });
      expect(fakeDb.executedSql.some((query) => query.includes("refresh_sprint1_read_models"))).toBe(true);
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
      expect(insertedRows(fakeDb, paymentReceipt)).toHaveLength(0);
      expect(insertedRows(fakeDb, repayment)).toHaveLength(0);
      expect(insertedRows(fakeDb, contribution)).toHaveLength(0);
    });
  });
});
