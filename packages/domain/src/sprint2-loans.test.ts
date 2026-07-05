import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  alert,
  auditLogEntry,
  contribution,
  groupConfig,
  loan as loanTable,
  loanDisbursement,
  loanFee,
  loanGuarantor,
  loanReferral,
  loanSchedule,
  nonMemberBorrower,
  repayment,
  withdrawal,
} from "@mi-banquito/db/schema";
import {
  calculateInterestFirstSplit,
  evaluateLoanEligibility,
  generateReferralCommissionCredit,
  resolveOriginationRate,
} from "./loan";
import { generateDecliningBalanceSchedule } from "./rules/loans/declining-balance";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type UpdateRecord = {
  tableName: string;
  values: Record<string, unknown>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

let tenantFakeDb: FakeDb;

vi.mock("@mi-banquito/db/tenant", () => ({
  withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => run(tenantFakeDb),
  withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => run(tenantFakeDb),
}));

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
  private readonly selectResults: unknown[][];

  constructor(selectResults: unknown[][]) {
    tenantFakeDb = this;
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

  async transaction<T>(callback: (tx: Pick<FakeDb, "insert" | "select" | "update">) => Promise<T>): Promise<T> {
    return callback(this);
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

describe("Sprint 2 loan domain rules", () => {
  it("uses the member rate for member loans and non-member rate for non-member loans", () => {
    const config = {
      memberLoanRateValue: "4.0000",
      nonMemberLoanRateValue: "5.0000",
    };

    expect(resolveOriginationRate(config, "member")).toBe("4.0000");
    expect(resolveOriginationRate(config, "non_member")).toBe("5.0000");
  });

  it("rejects loans that exceed available capital after protected base fund", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "1001.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
      guarantorSavingsBalance: undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "El monto solicitado ($1001.00) supera el dinero disponible del grupo ($1000.00). Baja el monto a $1000.00 o menos, o registra más aportes antes de crear este préstamo.",
    });
  });

  it("explains when the group fund has no recorded contributions", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "120.0000",
      availableCapital: "0.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
      guarantorSavingsBalance: undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "Todavía no hay aportes registrados en el fondo del grupo. Registra un aporte antes de crear un préstamo.",
    });
  });

  it("shows the requested amount and savings cap when the loan exceeds member capacity", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "120.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "30.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
      guarantorSavingsBalance: undefined,
    });

    expect(result).toEqual({
      ok: false,
      reason: "El monto solicitado ($120.00) supera el límite por ahorros ($90.00). Ese límite sale de $30.00 de ahorros disponibles x 3.00. Baja el monto a $90.00 o registra más ahorros para la socia o garante.",
    });
  });

  it("rejects non-member loans without guarantor capacity", () => {
    const result = evaluateLoanEligibility({
      requestedPrincipal: "500.0000",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "0.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "non_member",
      guarantorSavingsBalance: undefined,
    });

    if (result.ok) {
      throw new Error("expected non-member eligibility to fail");
    }
    expect(result.reason).toContain("garante");
  });

  it("splits repayments interest first", () => {
    expect(calculateInterestFirstSplit({
      amount: "125.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toEqual({
      appliedToFee: "0.0000",
      appliedToInterest: "40.0000",
      appliedToPrincipal: "85.0000",
      remainingFee: "0.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "915.0000",
      unappliedAmount: "0.0000",
      paidOff: false,
    });
  });

  it("keeps unapplied repayment overage visible", () => {
    expect(calculateInterestFirstSplit({
      amount: "2000.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toEqual({
      appliedToFee: "0.0000",
      appliedToInterest: "40.0000",
      appliedToPrincipal: "1000.0000",
      remainingFee: "0.0000",
      remainingInterest: "0.0000",
      remainingPrincipal: "0.0000",
      unappliedAmount: "960.0000",
      paidOff: true,
    });
  });

  it("records an early payment as the next scheduled quota including admin fee", async () => {
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
      [
        {
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
        },
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          orgId: "11111111-1111-4111-8111-111111111111",
          loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          periodIndex: 2,
          dueOn: "2026-09-02",
          principalDue: "10.0000",
          interestDue: "4.5000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
      ],
      [],
      [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        amount: "1.0000",
        datedOn: "2026-08-02",
        feeKind: "admin",
      }],
      [{ displayName: "Pancho" }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");
      const result = await createLoanService().recordRepayment({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: "16.0000",
        datedOn: "2026-07-02",
      });

      expect(result.split).toMatchObject({
        appliedToFee: "1.0000",
        appliedToInterest: "5.0000",
        appliedToPrincipal: "10.0000",
        remainingFee: "0.0000",
        remainingInterest: "4.5000",
        remainingPrincipal: "90.0000",
      });
      expect(insertedRows(fakeDb, repayment)[0]).toMatchObject({
        amount: "16.0000",
        appliedToFee: "1.0000",
        appliedToInterest: "5.0000",
        appliedToPrincipal: "10.0000",
      });
      expect(updatedRows(fakeDb, loanSchedule)[0]).toMatchObject({
        paidInterestToDate: "5.0000",
        paidPrincipalToDate: "10.0000",
        status: "pagado",
      });
      expect(updatedRows(fakeDb, loanSchedule)[1]).toMatchObject({
        paidInterestToDate: "0.0000",
        paidPrincipalToDate: "0.0000",
        status: "pendiente",
      });
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("allows exact loan cap boundaries without binary float drift", () => {
    expect(evaluateLoanEligibility({
      requestedPrincipal: "300.0024",
      availableCapital: "300.0024",
      borrowerSavingsBalance: "100.0008",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
    })).toEqual({ ok: true });
  });

  it("rejects invalid decimal inputs", () => {
    expect(() => evaluateLoanEligibility({
      requestedPrincipal: "not-money",
      availableCapital: "1000.0000",
      borrowerSavingsBalance: "500.0000",
      loanToSavingsCapRatio: "3.00",
      borrowerKind: "member",
    })).toThrow();
    expect(() => calculateInterestFirstSplit({
      amount: "-1.0000",
      accruedInterest: "40.0000",
      outstandingPrincipal: "1000.0000",
    })).toThrow();
    expect(() => generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: null,
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "NaN",
      commissionCurrency: "USD",
    })).toThrow();
  });

  it("plans a referral commission exactly once", () => {
    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: null,
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({
      shouldCredit: true,
      withdrawalKind: "referral_commission_credit",
      amount: "10.0000",
      currencyCode: "USD",
      memberId: "22222222-2222-4222-8222-222222222222",
    });

    expect(generateReferralCommissionCredit({
      loanStatus: "pagado",
      referralAccruedAt: new Date("2026-06-30T00:00:00Z"),
      referrerMemberId: "22222222-2222-4222-8222-222222222222",
      commissionAmount: "10.0000",
      commissionCurrency: "USD",
    })).toEqual({ shouldCredit: false });
  });

  it("keeps the origination admin fee on installment one only", () => {
    const schedule = generateDecliningBalanceSchedule({
      principal: 1000,
      ratePerPeriod: 0.04,
      termPeriods: 4,
      adminFeeRate: 0.01,
    });

    expect(schedule.installments.map((row) => row.feeDue)).toEqual([
      "10.00",
      "0.00",
      "0.00",
      "0.00",
    ]);
    expect(schedule.totals.feeDue).toBe("10.00");
  });

  it("persists non-member loan origination with schedule, first-period fee, guarantor, referral, and audit", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        version: 7,
        validTo: null,
        currencyCode: "USD",
        loanRateModel: "declining_balance",
        loanRateValue: "4.0000",
        loanGracePeriods: 0,
        loanToSavingsCapRatio: "3.00",
        config: {
          nonMemberLoanRateValue: "5.0000",
          adminFeePct: "1.0000",
          referralCommissionAmount: "10.0000",
        },
      }],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "activo",
        initialSavingsBalance: "500.0000",
      }],
      [],
      [],
      [],
      [],
      [{
        orgId: "11111111-1111-4111-8111-111111111111",
        availableCapital: "2000.0000",
      }],
      [{
        id: "66666666-6666-4666-8666-666666666666",
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "activo",
        initialSavingsBalance: "500.0000",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");
      const result = await createLoanService().originateLoan({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        borrowerKind: "non_member",
        nonMemberDisplayName: "Cliente externo",
        nonMemberWhatsappNumber: "+593987654321",
        nonMemberNationalIdLast4: "1234",
        guarantorMemberId: "55555555-5555-4555-8555-555555555555",
        referrerMemberId: "66666666-6666-4666-8666-666666666666",
        principalAmount: "1000.0000",
        termPeriods: 2,
        originatedOn: "2026-07-01",
        disbursementSource: "petty_cash",
        purpose: "Capital de trabajo",
      });

      expect(result.loanId).toMatch(/^[0-9a-f-]{36}$/);
      expect(insertedRows(fakeDb, nonMemberBorrower)).toHaveLength(1);

      const [loan] = insertedRows(fakeDb, loanTable);
      expect(loan).toMatchObject({
        id: result.loanId,
        orgId: "11111111-1111-4111-8111-111111111111",
        memberId: null,
        borrowerKind: "non_member",
        principalAmount: "1000.0000",
        currencyCode: "USD",
        rateValue: "5.0000",
        rateModel: "declining_balance",
        termPeriods: 2,
        gracePeriods: 0,
        originatedOn: "2026-07-01",
        status: "activo",
        purpose: "Capital de trabajo",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        groupConfigVersionAtOrigination: 7,
        referrerMemberId: "66666666-6666-4666-8666-666666666666",
        createdBy: "22222222-2222-4222-8222-222222222222",
        createdByKind: "member",
      });

      const schedules = insertedRows(fakeDb, loanSchedule);
      expect(schedules).toHaveLength(2);
      expect(schedules.map((row) => row.dueOn)).toEqual(["2026-08-01", "2026-09-01"]);
      expect(schedules.map((row) => row.principalDue)).toEqual(["500.0000", "500.0000"]);
      expect(schedules.map((row) => row.interestDue)).toEqual(["50.0000", "25.0000"]);

      expect(insertedRows(fakeDb, loanFee)).toHaveLength(1);
      expect(insertedRows(fakeDb, loanFee)[0]).toMatchObject({
        loanId: result.loanId,
        feeKind: "admin",
        amount: "10.0000",
        currencyCode: "USD",
        datedOn: "2026-08-01",
        accruedOn: "2026-07-01",
        groupConfigVersion: 7,
        feedsSurplus: true,
      });
      expect(insertedRows(fakeDb, loanDisbursement)[0]).toMatchObject({
        orgId: "11111111-1111-4111-8111-111111111111",
        loanId: result.loanId,
        disbursementSource: "petty_cash",
        amount: "1000.0000",
        currencyCode: "USD",
        disbursedOn: "2026-07-01",
        createdBy: "22222222-2222-4222-8222-222222222222",
        createdByKind: "member",
      });

      expect(insertedRows(fakeDb, loanGuarantor)[0]).toMatchObject({
        loanId: result.loanId,
        guarantorMemberId: "55555555-5555-4555-8555-555555555555",
        liabilityAmount: "1000.0000",
      });
      expect(insertedRows(fakeDb, loanReferral)[0]).toMatchObject({
        loanId: result.loanId,
        referrerMemberId: "66666666-6666-4666-8666-666666666666",
        commissionAmount: "10.0000",
        commissionCurrency: "USD",
      });
      expect(insertedRows(fakeDb, auditLogEntry)[0]).toMatchObject({
        actionKind: "loan.originated",
        subjectKind: "loan",
        subjectId: result.loanId,
        payloadSnapshot: expect.objectContaining({
          disbursementSource: "petty_cash",
        }),
      });
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("shows historical accruals using the remaining principal basis after repayments", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: "11111111-1111-4111-8111-111111111111",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        borrowerNonMemberId: null,
        principalAmount: "100.0000",
        currencyCode: "USD",
        status: "activo",
        rateValue: "5.0000",
        rateModel: "declining_balance",
        termPeriods: 10,
        originatedOn: "2026-07-02",
      }],
      [],
      [],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: "16.0000",
        appliedToInterest: "0.0000",
        appliedToPrincipal: "16.0000",
        datedOn: "2026-07-02",
        reversesId: null,
        reverseReason: null,
      }],
      [{
        accruedOn: "2026-07-02",
        principalBasis: "100.0000",
        interestAmount: "0.1667",
      }],
      [],
      [],
      [{ displayName: "Pancho" }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      const detail = await createLoanService().getLoanDetail(
        "11111111-1111-4111-8111-111111111111",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );

      expect(detail?.accruals).toEqual([{
        accruedOn: "2026-07-02",
        interestAmount: "0.1400",
        principalBasis: "84.0000",
      }]);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("shows repayment fee splits and paid admin fee totals in loan detail", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: "11111111-1111-4111-8111-111111111111",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        borrowerNonMemberId: null,
        principalAmount: "100.0000",
        currencyCode: "USD",
        status: "activo",
        rateValue: "5.0000",
        rateModel: "declining_balance",
        termPeriods: 10,
        originatedOn: "2026-07-02",
      }],
      [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        periodIndex: 1,
        dueOn: "2026-08-02",
        principalDue: "10.0000",
        interestDue: "5.0000",
        paidPrincipalToDate: "10.0000",
        paidInterestToDate: "5.0000",
        status: "pagado",
      }],
      [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        loanScheduleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        feeKind: "admin",
        amount: "1.0000",
        datedOn: "2026-08-02",
      }],
      [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        loanId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: "16.0000",
        appliedToFee: "1.0000",
        appliedToInterest: "5.0000",
        appliedToPrincipal: "10.0000",
        datedOn: "2026-07-02",
        reversesId: null,
        reverseReason: null,
      }],
      [],
      [],
      [],
      [{ displayName: "Pancho" }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      const detail = await createLoanService().getLoanDetail(
        "11111111-1111-4111-8111-111111111111",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );

      expect(detail?.repayments[0]).toMatchObject({
        amount: "16.0000",
        appliedToFee: "1.0000",
        appliedToInterest: "5.0000",
        appliedToPrincipal: "10.0000",
      });
      expect(detail?.fees[0]).toMatchObject({
        feeKind: "admin",
        amount: "1.0000",
        paidToDate: "1.0000",
      });
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("subtracts active guarantor exposure before approving a non-member loan", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        version: 7,
        validTo: null,
        currencyCode: "USD",
        loanRateModel: "declining_balance",
        loanRateValue: "4.0000",
        loanGracePeriods: 0,
        loanToSavingsCapRatio: "3.00",
        config: {
          nonMemberLoanRateValue: "5.0000",
          adminFeePct: "1.0000",
          referralCommissionAmount: "0.0000",
        },
      }],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "activo",
        initialSavingsBalance: "100.0000",
      }],
      [],
      [{ liabilityAmount: "250.0000" }],
      [],
      [],
      [{
        orgId: "11111111-1111-4111-8111-111111111111",
        availableCapital: "2000.0000",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      await expect(createLoanService().originateLoan({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        borrowerKind: "non_member",
        nonMemberDisplayName: "Cliente externo",
        guarantorMemberId: "55555555-5555-4555-8555-555555555555",
        principalAmount: "100.0000",
        termPeriods: 2,
        originatedOn: "2026-07-01",
      })).rejects.toThrow("ahorros");

      expect(fakeDb.inserts).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("subtracts active borrower and guarantor exposure before approving a member loan", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        version: 7,
        validTo: null,
        currencyCode: "USD",
        loanRateModel: "declining_balance",
        loanRateValue: "4.0000",
        loanGracePeriods: 0,
        loanToSavingsCapRatio: "3.00",
        config: {},
      }],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "activo",
        initialSavingsBalance: "100.0000",
      }],
      [{ status: "activo", principalAmount: "250.0000" }],
      [{ liabilityAmount: "50.0000" }],
      [],
      [],
      [{
        orgId: "11111111-1111-4111-8111-111111111111",
        availableCapital: "2000.0000",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      await expect(createLoanService().originateLoan({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        principalAmount: "1.0000",
        termPeriods: 2,
        originatedOn: "2026-07-01",
      })).rejects.toThrow("ahorros");

      expect(fakeDb.inserts).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("uses net member contributions as savings capacity for member loan approval", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        version: 7,
        validTo: null,
        currencyCode: "USD",
        loanRateModel: "declining_balance",
        loanRateValue: "4.0000",
        loanGracePeriods: 0,
        loanToSavingsCapRatio: "2.00",
        config: {},
      }],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "activo",
        initialSavingsBalance: "0.0000",
      }],
      [],
      [],
      [{ amount: "60.0000" }],
      [],
      [{
        orgId: "11111111-1111-4111-8111-111111111111",
        availableCapital: "200.0000",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      await expect(createLoanService().originateLoan({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        principalAmount: "100.0000",
        termPeriods: 2,
        originatedOn: "2026-07-01",
      })).resolves.toMatchObject({ loanId: expect.any(String) });

      expect(insertedRows(fakeDb, contribution)).toHaveLength(0);
      expect(insertedRows(fakeDb, loanTable)).toHaveLength(1);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("lists only active guarantor members with remaining capacity", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        version: 7,
        validTo: null,
        currencyCode: "USD",
        loanRateModel: "declining_balance",
        loanRateValue: "4.0000",
        loanGracePeriods: 0,
        loanToSavingsCapRatio: "3.00",
        config: {},
      }],
      [
        {
          id: "55555555-5555-4555-8555-555555555555",
          displayName: "Sin capacidad",
          status: "activo",
          initialSavingsBalance: "100.0000",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          displayName: "Con capacidad",
          status: "activo",
          initialSavingsBalance: "100.0000",
        },
      ],
      [{ status: "activo", principalAmount: "300.0000" }],
      [],
      [{ status: "activo", principalAmount: "100.0000" }],
      [{ liabilityAmount: "50.0000" }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");

      await expect(createLoanService().listEligibleGuarantorMembers(
        "11111111-1111-4111-8111-111111111111",
      )).resolves.toEqual([{
        id: "66666666-6666-4666-8666-666666666666",
        displayName: "Con capacidad",
      }]);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("records a final repayment, marks the loan paid, and credits referral exactly once", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "77777777-7777-4777-8777-777777777777",
        orgId: "11111111-1111-4111-8111-111111111111",
        borrowerKind: "member",
        borrowerMemberId: "55555555-5555-4555-8555-555555555555",
        principalAmount: "1000.0000",
        currencyCode: "USD",
        status: "activo",
      }],
      [],
      [
        {
          id: "88888888-8888-4888-8888-888888888888",
          orgId: "11111111-1111-4111-8111-111111111111",
          loanId: "77777777-7777-4777-8777-777777777777",
          periodIndex: 1,
          dueOn: "2026-07-01",
          principalDue: "1000.0000",
          interestDue: "40.0000",
          paidPrincipalToDate: "0.0000",
          paidInterestToDate: "0.0000",
          status: "pendiente",
        },
      ],
      [],
      [],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        displayName: "Ana Mora",
      }],
      [{
        id: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
        loanId: "77777777-7777-4777-8777-777777777777",
        referrerMemberId: "66666666-6666-4666-8666-666666666666",
        commissionAmount: "10.0000",
        commissionCurrency: "USD",
        accruedAt: null,
        withdrawalId: null,
      }],
      [{
        id: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
        loanId: "77777777-7777-4777-8777-777777777777",
        referrerMemberId: "66666666-6666-4666-8666-666666666666",
        commissionAmount: "10.0000",
        commissionCurrency: "USD",
        accruedAt: null,
        withdrawalId: null,
      }],
      [{
        id: "66666666-6666-4666-8666-666666666666",
        displayName: "Rosa Vera",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createLoanService } = await import("./loan");
      const result = await createLoanService().recordRepayment({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "22222222-2222-4222-8222-222222222222",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        loanId: "77777777-7777-4777-8777-777777777777",
        amount: "1040.0000",
        datedOn: "2026-07-01",
      });

      expect(result.paidOff).toBe(true);
      expect(result.split).toMatchObject({
        appliedToInterest: "40.0000",
        appliedToPrincipal: "1000.0000",
        remainingInterest: "0.0000",
        remainingPrincipal: "0.0000",
      });
      expect(insertedRows(fakeDb, repayment)[0]).toMatchObject({
        loanId: "77777777-7777-4777-8777-777777777777",
        memberId: "55555555-5555-4555-8555-555555555555",
        amount: "1040.0000",
        appliedToInterest: "40.0000",
        appliedToPrincipal: "1000.0000",
      });
      expect(updatedRows(fakeDb, loanTable)).toContainEqual(expect.objectContaining({ status: "pagado" }));
      expect(updatedRows(fakeDb, loanSchedule)).toContainEqual(expect.objectContaining({
        status: "pagado",
        paidInterestToDate: "40.0000",
        paidPrincipalToDate: "1000.0000",
      }));
      expect(insertedRows(fakeDb, withdrawal)[0]).toMatchObject({
        memberId: "66666666-6666-4666-8666-666666666666",
        kind: "referral_commission_credit",
        amount: "10.0000",
        clientRequestId: "99999999-9999-4999-8999-999999999999",
      });
      expect(updatedRows(fakeDb, loanReferral)[0]).toMatchObject({
        accruedAt: expect.any(Date),
        withdrawalId: expect.any(String),
      });
      expect(insertedRows(fakeDb, alert)[0]).toMatchObject({
        alertKind: "loan_referral_commission",
        severity: "low",
      });
      expect(insertedRows(fakeDb, alert)[0]?.payload).toMatchObject({
        message: expect.stringContaining("Ana Mora"),
      });
      expect(insertedRows(fakeDb, alert)[0]?.payload).toMatchObject({
        message: expect.stringContaining("Rosa Vera"),
      });
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          actionKind: "loan.referral_commission.credit",
          subjectKind: "withdrawal",
        }),
        expect.objectContaining({
        actionKind: "loan.repayment.payoff",
        subjectKind: "repayment",
        }),
      ]));
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });
});
