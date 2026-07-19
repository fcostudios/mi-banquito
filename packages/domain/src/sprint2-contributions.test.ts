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
    private readonly nextReturnedId: () => string,
  ) {}

  values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.inserts.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  returning() {
    const inserted = this.inserts.at(-1)?.values;
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return Promise.resolve([{ id: this.nextReturnedId(), ...row }]);
  }

  onConflictDoUpdate() {
    return this;
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly executedSql: string[] = [];
  private readonly selectResults: unknown[][];
  private readonly returnedIds: string[];

  constructor(selectResults: unknown[][], returnedIds: string[] = []) {
    this.selectResults = [...selectResults];
    this.returnedIds = [...returnedIds];
  }

  select() {
    return new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts, () => this.returnedIds.shift() ?? "99999999-9999-4999-8999-999999999999");
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

  it("records an explicitly targeted contribution against the overdue cycle and refreshes read models", async () => {
    const overdueCycle = {
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleLabel: "2026-06",
      expectedAmountPerMember: "20.0000",
      status: "closed",
    };
    const fakeDb = new FakeDb([
      [],
      [overdueCycle],
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
          cycleId: overdueCycle.id,
          amount: "20.0000",
          datedOn: "2026-07-08",
          paymentSource: "cash_in_meeting",
          kind: "regular",
          slipPhotoId: "",
          notes: "Pago de atraso 2026-06",
        },
      );

      expect(insertedRows(fakeDb, contribution)[0]).toMatchObject({
        cycleId: overdueCycle.id,
        memberId: "44444444-4444-4444-8444-444444444444",
        amount: "20.0000",
        datedOn: "2026-07-08",
      });
      expect(insertedRows(fakeDb, contributionCycle)).toHaveLength(0);
      expect(fakeDb.executedSql).toHaveLength(1);
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
          subjectKind: "member_negative_balance_event",
          subjectId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
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

  it("emits separate A14 alerts for distinct negative-balance events for the same member", async () => {
    const fakeDb = new FakeDb([
      [],
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      [{
        memberId: "44444444-4444-4444-8444-444444444444",
        displayName: "Pancho",
        currentBalance: "-1.0000",
        state: "atrasado",
      }],
      [],
      [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      [{
        memberId: "44444444-4444-4444-8444-444444444444",
        displayName: "Pancho",
        currentBalance: "-2.0000",
        state: "atrasado",
      }],
    ], [
      "99999999-9999-4999-8999-999999999991",
      "99999999-9999-4999-8999-999999999992",
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) => fakeDb.transaction(() => run(fakeDb)),
    }));

    try {
      const { createLedgerService } = await import("./ledger");
      const service = createLedgerService();
      await service.recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "33333333-3333-4333-8333-333333333331",
          memberId: "44444444-4444-4444-8444-444444444444",
          amount: "10.0000",
          datedOn: "2026-07-01",
          paymentSource: "bank_transfer",
          kind: "regular",
          slipPhotoId: "55555555-5555-4555-8555-555555555555",
        },
      );
      await service.recordContribution(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        {
          clientRequestId: "33333333-3333-4333-8333-333333333332",
          memberId: "44444444-4444-4444-8444-444444444444",
          amount: "11.0000",
          datedOn: "2026-07-02",
          paymentSource: "bank_transfer",
          kind: "regular",
          slipPhotoId: "55555555-5555-4555-8555-555555555555",
        },
      );

      const alerts = insertedRows(fakeDb, alert);
      expect(alerts).toHaveLength(2);
      expect(alerts.map((row) => row.alertKind)).toEqual(["A14", "A14"]);
      expect(alerts.map((row) => row.subjectKind)).toEqual([
        "member_negative_balance_event",
        "member_negative_balance_event",
      ]);
      expect(alerts.map((row) => (row.payload as Record<string, unknown>).sourceEventId)).toEqual([
        "99999999-9999-4999-8999-999999999991",
        "99999999-9999-4999-8999-999999999992",
      ]);
      expect(alerts[0]?.subjectId).not.toBe(alerts[1]?.subjectId);
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
        { id: "99999999-9999-4999-8999-999999999999", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "77777777-7777-4777-8777-777777777777", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "88888888-8888-4888-8888-888888888888", amount: "10.0000", reversesId: null, slipPhotoId: null },
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

  it("does not emit A11 when a recent contribution with a slip photo resets the streak", async () => {
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
        { id: "99999999-9999-4999-8999-999999999999", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "77777777-7777-4777-8777-777777777777", amount: "10.0000", reversesId: null, slipPhotoId: "55555555-5555-4555-8555-555555555555" },
        { id: "88888888-8888-4888-8888-888888888888", amount: "10.0000", reversesId: null, slipPhotoId: null },
      ],
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

      expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("does not count reversal rows toward the A11 missing-photo streak", async () => {
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
        { id: "99999999-9999-4999-8999-999999999999", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "77777777-7777-4777-8777-777777777777", amount: "-10.0000", reversesId: "66666666-6666-4666-8666-666666666666", slipPhotoId: null },
        { id: "88888888-8888-4888-8888-888888888888", amount: "10.0000", reversesId: null, slipPhotoId: null },
      ],
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

      expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("suppresses duplicate A11 while an active dedup window exists", async () => {
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
        { id: "99999999-9999-4999-8999-999999999999", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "77777777-7777-4777-8777-777777777777", amount: "10.0000", reversesId: null, slipPhotoId: null },
        { id: "88888888-8888-4888-8888-888888888888", amount: "10.0000", reversesId: null, slipPhotoId: null },
      ],
      [{
        id: "66666666-6666-4666-8666-666666666666",
        dedupWindowEnd: new Date(Date.now() + 60_000),
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
          paymentSource: "cash_in_meeting",
          kind: "regular",
          slipPhotoId: "",
        },
      );

      expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("refreshes read models after base-fund quota payments change protected capital", async () => {
    const fakeDb = new FakeDb([[{ id: "55555555-5555-4555-8555-555555555555" }]]);
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
