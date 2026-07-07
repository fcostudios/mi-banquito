import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { ContributionForm } from "@mi-banquito/contracts";
import { alert, auditLogEntry, baseFundQuotaPayment, contribution, contributionCycle } from "@mi-banquito/db/schema";
import {
  deriveComplianceState,
  isSlipRequiredForContribution,
  mapComplianceStatusToTone,
} from "./ledger";

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
    const inserted = this.inserts.at(-1)?.values;
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return Promise.resolve([{ id: "99999999-9999-4999-8999-999999999999", ...row }]);
  }

  onConflictDoUpdate() {
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
    this.executedSql.push(String(query));
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

describe("Sprint 2 contribution source and partial state", () => {
  it("keeps source and kind available for ledger persistence", () => {
    const input = {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "cash_in_meeting",
      kind: "partial",
      slipPhotoId: "",
    } satisfies ContributionForm;

    expect(input.paymentSource).toBe("cash_in_meeting");
    expect(input.kind).toBe("partial");
  });

  it("requires slips only for bank and petty-cash deposit sources", () => {
    expect(isSlipRequiredForContribution("cash_in_meeting")).toBe(false);
    expect(isSlipRequiredForContribution("bank_transfer")).toBe(true);
    expect(isSlipRequiredForContribution("petty_cash_deposit")).toBe(true);
  });

  it("derives partial compliance between zero and the expected monthly amount", () => {
    expect(deriveComplianceState({ paidAmount: "0.0000", expectedAmount: "10.0000" })).toBe("atrasado");
    expect(deriveComplianceState({ paidAmount: "5.0000", expectedAmount: "10.0000" })).toBe("parcial");
    expect(deriveComplianceState({ paidAmount: "10.0000", expectedAmount: "10.0000" })).toBe("al_dia");
    expect(deriveComplianceState({ paidAmount: "12.0000", expectedAmount: "10.0000" })).toBe("al_dia");
  });

  it("renders partial compliance with a distinct neutral tone", () => {
    expect(mapComplianceStatusToTone("parcial")).toBe("neutral");
    expect(mapComplianceStatusToTone("atrasado")).toBe("warning");
  });

  it("orders the compliance MV so partial payments stay parcial before late or mora", () => {
    const migration = readFileSync(
      new URL("../../db/src/migrations/V20260630090000__sprint_2_loans_cron_contribution_source.sql", import.meta.url),
      "utf8",
    );

    expect(migration.indexOf("WHEN COALESCE(SUM(c.amount), 0) > 0 THEN 'parcial'"))
      .toBeLessThan(migration.indexOf("WHEN CURRENT_DATE > cc.closes_on"));
  });

  it("creates new contribution cycles with configured expected amount, not first partial payment", async () => {
    const fakeDb = new FakeDb([
      [],
      [],
      [{ contributionAmount: "25.0000" }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
    }));

    try {
      const { createLedgerService } = await import("./ledger");
      await createLedgerService().recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "33333333-3333-4333-8333-333333333333",
          memberId: "44444444-4444-4444-8444-444444444444",
          amount: "10.0000",
          datedOn: "2026-07-01",
          paymentSource: "cash_in_meeting",
          kind: "partial",
          slipPhotoId: "",
        },
      );

      expect(insertedRows(fakeDb, contributionCycle)[0]).toMatchObject({
        opensOn: "2026-07-01",
        closesOn: "2026-07-31",
        expectedAmountPerMember: "25.0000",
      });
      expect(insertedRows(fakeDb, contribution)[0]).toMatchObject({
        amount: "10.0000",
        kind: "partial",
        paymentSource: "cash_in_meeting",
      });
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(1);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("emits A14 when a contribution event leaves the member balance negative", async () => {
    const fakeDb = new FakeDb([
      [],
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      [{
        memberId: "44444444-4444-4444-8444-444444444444",
        displayName: "Pancho",
        currentBalance: "-1.0000",
        state: "atrasado",
      }],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
    }));

    try {
      const { createLedgerService } = await import("./ledger");
      await createLedgerService().recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "33333333-3333-4333-8333-333333333333",
          memberId: "44444444-4444-4444-8444-444444444444",
          amount: "10.0000",
          datedOn: "2026-07-01",
          paymentSource: "bank_transfer",
          kind: "regular",
          slipPhotoId: "55555555-5555-4555-8555-555555555555",
        },
      );

      expect(insertedRows(fakeDb, alert)).toEqual([
        expect.objectContaining({
          alertKind: "A14",
          severity: "critical",
          audience: "both",
          subjectKind: "member",
          subjectId: "44444444-4444-4444-8444-444444444444",
          payload: expect.objectContaining({
            memberName: "Pancho",
            balance: "-1.0000",
            sourceEventId: "99999999-9999-4999-8999-999999999999",
          }),
        }),
      ]);
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionKind: "alert.negative_member_balance.emit" }),
      ]));
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("emits A11 after the configured number of consecutive contributions without photo", async () => {
    const fakeDb = new FakeDb([
      [],
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      [{
        memberId: "44444444-4444-4444-8444-444444444444",
        displayName: "Pancho",
        currentBalance: "20.0000",
        state: "al_dia",
      }],
      [{ config: { no_slip_consecutive_threshold: 3 } }],
      [
        { id: "99999999-9999-4999-8999-999999999999", slipPhotoId: null },
        { id: "77777777-7777-4777-8777-777777777777", slipPhotoId: null },
        { id: "88888888-8888-4888-8888-888888888888", slipPhotoId: null },
      ],
      [],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
    }));

    try {
      const { createLedgerService } = await import("./ledger");
      await createLedgerService().recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "33333333-3333-4333-8333-333333333333",
          memberId: "44444444-4444-4444-8444-444444444444",
          amount: "10.0000",
          datedOn: "2026-07-01",
          paymentSource: "cash_in_meeting",
          kind: "regular",
          slipPhotoId: "",
        },
      );

      expect(insertedRows(fakeDb, alert)).toEqual([
        expect.objectContaining({
          alertKind: "A11",
          severity: "low",
          audience: "treasurer",
          subjectKind: "member",
          subjectId: "44444444-4444-4444-8444-444444444444",
          payload: expect.objectContaining({
            memberName: "Pancho",
            threshold: 3,
            consecutiveCount: 3,
          }),
        }),
      ]);
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionKind: "alert.contribution_missing_photo.emit" }),
      ]));
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("refreshes read models after base-fund quota payments change protected capital", async () => {
    const fakeDb = new FakeDb([]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
    }));

    try {
      const { createLedgerService } = await import("./ledger");
      await createLedgerService().recordBaseFundQuotaPayment(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          memberId: "44444444-4444-4444-8444-444444444444",
          fiscalYear: 2026,
          amount: "25.0000",
          paidOn: "2026-07-01",
          slipPhotoId: "",
        },
      );

      expect(insertedRows(fakeDb, baseFundQuotaPayment)[0]).toMatchObject({
        amount: "25.0000",
      });
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(1);
      expect(fakeDb.executedSql).toHaveLength(1);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });
});
