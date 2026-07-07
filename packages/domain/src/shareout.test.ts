import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  auditLogEntry,
  entityVersion,
  statementArchive,
  statementArchiveSupersession,
  withdrawal,
  yearEndShareOut,
  yearEndShareOutLine,
  yearEndShareOutReversal,
} from "@mi-banquito/db/schema";

import {
  applyShareOutOverride,
  assertShareOutReconciled,
  computeTwoPoolDraft,
  fiscalYearForDate,
} from "./shareout";

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

  limit() {
    return Promise.resolve(this.nextResult(this.tableName));
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
  readonly executes: string[] = [];
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
    return new FakeSelectBuilder((tableName) => this.selectResultsByTableName[tableName]?.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts, (tableName, inserted) => {
      const queued = this.insertReturningByTableName[tableName]?.shift();
      if (queued) return queued;
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return row ? [{ id: `${tableName}-inserted`, ...row }] : [];
    });
  }

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates);
  }

  execute(query: unknown) {
    this.executes.push(String(query));
    return Promise.resolve([]);
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

async function withMockedShareOutDb<T>(fakeDb: FakeDb, callback: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withTenantTransaction: async <R>(_orgId: string, run: (tx: FakeDb) => Promise<R>): Promise<R> => run(fakeDb),
    withWritableTenantTransaction: async <R>(_orgId: string, run: (tx: FakeDb) => Promise<R>): Promise<R> => run(fakeDb),
  }));
  try {
    return await callback();
  } finally {
    vi.doUnmock("@mi-banquito/db/tenant");
    vi.resetModules();
  }
}

describe("year-end share-out", () => {
  it("bins fiscal years by configured start month", () => {
    expect(fiscalYearForDate("2026-01-01", { startMonth: 1, startDay: 1 })).toBe(2026);
    expect(fiscalYearForDate("2026-01-01", { startMonth: 7, startDay: 1 })).toBe(2025);
  });

  it("computes two-pool shares and reconciles pool totals", () => {
    const draft = computeTwoPoolDraft({
      repartoTotal: "100.0000",
      loanPoolPct: "0.3000",
      savingsPoolPct: "0.7000",
      members: [
        { memberId: "a", accumulatedSavings: "100.0000", saldoPonderadoUsdDias: "1000.0000", loanActivityBasis: "300.0000" },
        { memberId: "b", accumulatedSavings: "200.0000", saldoPonderadoUsdDias: "3000.0000", loanActivityBasis: "700.0000" },
      ],
    });
    expect(draft.lines).toEqual([
      expect.objectContaining({ memberId: "a", loanBonusC: "9.0000", savingsInterest: "17.5000", draftShareAmount: "26.5000" }),
      expect.objectContaining({ memberId: "b", loanBonusC: "21.0000", savingsInterest: "52.5000", draftShareAmount: "73.5000" }),
    ]);
    expect(draft.totalDraft).toBe("100.0000");
  });

  it("requires a reason for non-zero overrides and records the parent adjustment amount", () => {
    expect(() => applyShareOutOverride({
      repartoTotal: "100.0000",
      lineId: "line-a",
      overrideAmount: "30.0000",
      reason: "",
      lines: [
        { id: "line-a", memberId: "a", draftShareAmount: "26.5000", finalShareAmount: "26.5000" },
        { id: "line-b", memberId: "b", draftShareAmount: "73.5000", finalShareAmount: "73.5000" },
      ],
    })).toThrow("override_reason_required");

    const result = applyShareOutOverride({
      repartoTotal: "100.0000",
      lineId: "line-a",
      overrideAmount: "30.0000",
      reason: "Aprobado por acta",
      lines: [
        { id: "line-a", memberId: "a", draftShareAmount: "26.5000", finalShareAmount: "26.5000" },
        { id: "line-b", memberId: "b", draftShareAmount: "73.5000", finalShareAmount: "73.5000" },
      ],
    });
    expect(result.ajusteAmount).toBe("-3.5000");
    expect(result.lines[0]).toMatchObject({ finalShareAmount: "30.0000", overrideReason: "Aprobado por acta" });
  });

  it("rejects approval when final shares do not reconcile to reparto total", () => {
    expect(() => assertShareOutReconciled({
      repartoTotal: "100.0000",
      ajusteAmount: "0.0000",
      lines: [
        { finalShareAmount: "30.0000" },
        { finalShareAmount: "60.0000" },
      ],
    })).toThrow("share_out_not_reconciled");
  });

  it("accepts approval when final shares plus adjustment equal reparto total", () => {
    expect(() => assertShareOutReconciled({
      repartoTotal: "100.0000",
      ajusteAmount: "10.0000",
      lines: [
        { finalShareAmount: "30.0000" },
        { finalShareAmount: "60.0000" },
      ],
    })).not.toThrow();
  });

  it("reverses a distributed share-out inside 24 hours with offset withdrawals, superseding PDFs, entity version, and audit", async () => {
    const createArtifact = vi.fn(async (input: { canonicalPayloadHash: string; kind: string }) => ({
      pdfUri: `/archives/${input.kind}/${input.canonicalPayloadHash}.pdf`,
      byteSize: 1234,
    }));
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "distributed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
        periodCloseId: "period-close-1",
      }]],
      [tableNameOf(yearEndShareOutReversal)]: [[]],
      [tableNameOf(yearEndShareOutLine)]: [[{
        id: "line-1",
        orgId: "org-1",
        yearEndShareOutId: "shareout-1",
        memberId: "member-1",
        finalShareAmount: "26.5000",
        withdrawalId: "withdrawal-1",
      }]],
      [tableNameOf(statementArchive)]: [[
        {
          id: "archive-1",
          orgId: "org-1",
          kind: "year_end_member",
          memberId: "member-1",
          periodLabel: "2026",
          pdfUri: "/old/member.pdf",
          canonicalPayloadHash: "old-member-hash",
          generatedAt: new Date("2026-07-01T12:00:00.000Z"),
          periodCloseId: "period-close-1",
          yearEndShareOutId: "shareout-1",
          byteSize: 100,
        },
        {
          id: "archive-2",
          orgId: "org-1",
          kind: "year_end_share_out",
          memberId: null,
          periodLabel: "2026",
          pdfUri: "/old/shareout.pdf",
          canonicalPayloadHash: "old-shareout-hash",
          generatedAt: new Date("2026-07-01T12:00:00.000Z"),
          periodCloseId: "period-close-1",
          yearEndShareOutId: "shareout-1",
          byteSize: 200,
        },
      ]],
    }, {
      [tableNameOf(yearEndShareOutReversal)]: [[{ id: "reversal-1" }]],
      [tableNameOf(withdrawal)]: [[{ id: "withdrawal-reversal-1" }]],
      [tableNameOf(statementArchive)]: [[{ id: "archive-new-1" }], [{ id: "archive-new-2" }]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-02T11:00:00.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact,
      })).resolves.toEqual({
        reversed: true,
        reversalId: "reversal-1",
        shareOutId: "shareout-1",
        offsetsCreated: 1,
      });
    });

    expect(insertedRows(fakeDb, withdrawal)).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        memberId: "member-1",
        amount: "-26.5000",
        kind: "year_end_reversal",
        shareOutId: "shareout-1",
        reversesId: "withdrawal-1",
        reverseReason: "Acta corrigió reparto anual",
        yearEndShareOutLineId: "line-1",
      }),
    ]);
    expect(insertedRows(fakeDb, yearEndShareOutReversal)).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        yearEndShareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        reversedBy: "actor-1",
        reversalPayload: expect.objectContaining({
          withdrawalOffsets: [expect.objectContaining({ amount: "-26.5000", reversesId: "withdrawal-1" })],
        }),
      }),
    ]);
    expect(updatedRows(fakeDb, yearEndShareOut)).toEqual([
      expect.objectContaining({ status: "reversed" }),
    ]);
    expect(updatedRows(fakeDb, statementArchive)).toEqual([]);
    expect(createArtifact).toHaveBeenCalledTimes(2);
    expect(insertedRows(fakeDb, statementArchive)).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        kind: "year_end_member",
        memberId: "member-1",
        periodLabel: "2026-reversal-reversal-1",
        yearEndShareOutId: "shareout-1",
      }),
      expect.objectContaining({
        orgId: "org-1",
        kind: "year_end_share_out",
        memberId: null,
        periodLabel: "2026-reversal-reversal-1",
        yearEndShareOutId: "shareout-1",
      }),
    ]);
    expect(insertedRows(fakeDb, statementArchiveSupersession)).toEqual([
      expect.objectContaining({
        supersededStatementArchiveId: "archive-1",
        supersedingStatementArchiveId: "archive-new-1",
        yearEndShareOutReversalId: "reversal-1",
      }),
      expect.objectContaining({
        supersededStatementArchiveId: "archive-2",
        supersedingStatementArchiveId: "archive-new-2",
        yearEndShareOutReversalId: "reversal-1",
      }),
    ]);
    expect(insertedRows(fakeDb, entityVersion)).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        entityKind: "YearEndShareOut",
        entityId: "shareout-1",
        version: 1,
        changeKind: "status_transition",
        changeReason: "Acta corrigió reparto anual",
      }),
    ]);
    expect(insertedRows(fakeDb, auditLogEntry)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionKind: "year_end_share_out.reversed",
        subjectKind: "year_end_share_out",
        subjectId: "shareout-1",
        reason: "Acta corrigió reparto anual",
      }),
    ]));
  });

  it("blocks reversal outside the 24-hour grace window", async () => {
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "distributed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      }]],
      [tableNameOf(yearEndShareOutReversal)]: [[]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-02T12:00:01.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact: async () => ({ pdfUri: "/unused.pdf", byteSize: 1 }),
      })).rejects.toThrow("share_out_reversal_window_closed");
    });
    expect(insertedRows(fakeDb, withdrawal)).toEqual([]);
  });

  it("returns the existing reversal without creating duplicate offsets", async () => {
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "reversed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
      }]],
      [tableNameOf(yearEndShareOutReversal)]: [[{ id: "reversal-1", yearEndShareOutId: "shareout-1" }]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-05T12:00:00.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact: async () => ({ pdfUri: "/unused.pdf", byteSize: 1 }),
      })).resolves.toEqual({
        reversed: false,
        reversalId: "reversal-1",
        shareOutId: "shareout-1",
        offsetsCreated: 0,
      });
    });

    expect(insertedRows(fakeDb, withdrawal)).toEqual([]);
    expect(insertedRows(fakeDb, yearEndShareOutReversal)).toEqual([]);
  });
});
