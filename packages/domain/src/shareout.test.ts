import { randomUUID } from "node:crypto";
import { getTableName, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

  it("keeps exact decimal(18,4) arithmetic at the largest supported pool", () => {
    const draft = computeTwoPoolDraft({
      repartoTotal: "99999999999999.9999",
      loanPoolPct: "0.3000",
      savingsPoolPct: "0.7000",
      members: [{
        memberId: "only",
        accumulatedSavings: "99999999999999.9999",
        saldoPonderadoUsdDias: "99999999999999.9999",
        loanActivityBasis: "99999999999999.9999",
      }],
    });

    expect(draft.loanPoolAmount).toBe("29999999999999.9999");
    expect(draft.savingsPoolAmount).toBe("70000000000000.0000");
    expect(draft.totalDraft).toBe("99999999999999.9999");
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
    let fakeDb: FakeDb;
    const createArtifact = vi.fn(async (input: { canonicalPayloadHash: string; kind: string }) => {
      expect(insertedRows(fakeDb, entityVersion)).toEqual([
        expect.objectContaining({ version: 4 }),
      ]);
      return {
        pdfUri: `/archives/${input.kind}/${input.canonicalPayloadHash}.pdf`,
        byteSize: 1234,
      };
    });
    fakeDb = new FakeDb({
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
      [tableNameOf(withdrawal)]: [[{
        id: "withdrawal-1",
        orgId: "org-1",
        memberId: "member-1",
        amount: "27.1234",
        kind: "year_end_share_out",
        shareOutId: "shareout-1",
        yearEndShareOutLineId: "line-1",
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
      [tableNameOf(entityVersion)]: [[{ version: 3 }]],
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
        supersedingArchiveIds: ["archive-new-1", "archive-new-2"],
      });
    });

    expect(insertedRows(fakeDb, withdrawal)).toEqual([
      expect.objectContaining({
        orgId: "org-1",
        memberId: "member-1",
        amount: "-27.1234",
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
          withdrawalOffsets: [expect.objectContaining({ amount: "-27.1234", reversesId: "withdrawal-1" })],
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
        version: 4,
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

  it("rejects reversal when a payable line lacks a matching original share-out withdrawal", async () => {
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "distributed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
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
      [tableNameOf(withdrawal)]: [[]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-02T11:00:00.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact: async () => ({ pdfUri: "/unused.pdf", byteSize: 1 }),
      })).rejects.toThrow("share_out_reversal_original_withdrawal_required");
    });

    expect(insertedRows(fakeDb, yearEndShareOutReversal)).toEqual([]);
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
      })).resolves.toMatchObject({
        reversed: false,
        reversalId: "reversal-1",
        shareOutId: "shareout-1",
        offsetsCreated: 0,
      });
    });

    expect(insertedRows(fakeDb, withdrawal)).toEqual([]);
    expect(insertedRows(fakeDb, yearEndShareOutReversal)).toEqual([]);
  });

  it("reuses existing supersession for null-member group archives on reversal retry", async () => {
    const createArtifact = vi.fn(async () => ({ pdfUri: "/should-not-upload.pdf", byteSize: 1 }));
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "reversed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
        periodCloseId: "period-close-1",
      }]],
      [tableNameOf(yearEndShareOutReversal)]: [[{
        id: "reversal-1",
        yearEndShareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        reversedAt: new Date("2026-07-02T11:00:00.000Z"),
        reversalPayload: {
          shareOutId: "shareout-1",
          reason: "Acta corrigió reparto anual",
          withdrawalOffsets: [{
            lineId: "line-1",
            memberId: "member-1",
            amount: "-27.1234",
            reversesId: "withdrawal-1",
          }],
        },
      }]],
      [tableNameOf(statementArchive)]: [[{
        id: "archive-1",
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
      }]],
      [tableNameOf(statementArchiveSupersession)]: [[{
        id: "supersession-1",
        supersededStatementArchiveId: "archive-1",
        supersedingStatementArchiveId: "archive-new-1",
        yearEndShareOutReversalId: "reversal-1",
      }]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-02T11:30:00.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact,
      })).resolves.toMatchObject({
        reversed: false,
        reversalId: "reversal-1",
        shareOutId: "shareout-1",
        offsetsCreated: 0,
        supersedingArchiveIds: ["archive-new-1"],
      });
    });

    expect(createArtifact).not.toHaveBeenCalled();
    expect(insertedRows(fakeDb, statementArchive)).toEqual([]);
    expect(insertedRows(fakeDb, statementArchiveSupersession)).toEqual([]);
  });

  it("links an existing null-member superseding archive without uploading a duplicate", async () => {
    const createArtifact = vi.fn(async () => ({ pdfUri: "/should-not-upload.pdf", byteSize: 1 }));
    const fakeDb = new FakeDb({
      [tableNameOf(yearEndShareOut)]: [[{
        id: "shareout-1",
        orgId: "org-1",
        year: 2026,
        status: "reversed",
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
        periodCloseId: "period-close-1",
      }]],
      [tableNameOf(yearEndShareOutReversal)]: [[{
        id: "reversal-1",
        yearEndShareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        reversedAt: new Date("2026-07-02T11:00:00.000Z"),
        reversalPayload: {
          shareOutId: "shareout-1",
          reason: "Acta corrigió reparto anual",
          withdrawalOffsets: [{
            lineId: "line-1",
            memberId: "member-1",
            amount: "-27.1234",
            reversesId: "withdrawal-1",
          }],
        },
      }]],
      [tableNameOf(statementArchive)]: [
        [{
          id: "archive-1",
          orgId: "org-1",
          kind: "year_end_snapshot",
          memberId: null,
          periodLabel: "2026",
          pdfUri: "/old/snapshot.pdf",
          canonicalPayloadHash: "old-snapshot-hash",
          generatedAt: new Date("2026-07-01T12:00:00.000Z"),
          periodCloseId: "period-close-1",
          yearEndShareOutId: "shareout-1",
          byteSize: 300,
        }],
        [{
          id: "archive-new-1",
          orgId: "org-1",
          kind: "year_end_snapshot",
          memberId: null,
          periodLabel: "2026-reversal-reversal-1",
          pdfUri: "/new/snapshot.pdf",
          canonicalPayloadHash: "new-snapshot-hash",
          generatedAt: new Date("2026-07-02T11:00:00.000Z"),
          periodCloseId: "period-close-1",
          yearEndShareOutId: "shareout-1",
          byteSize: 301,
        }],
      ],
      [tableNameOf(statementArchiveSupersession)]: [[]],
    });

    await withMockedShareOutDb(fakeDb, async () => {
      const { createShareOutService } = await import("./shareout");
      const service = createShareOutService({ now: () => new Date("2026-07-02T11:30:00.000Z") });

      await expect(service.reverseApprovedShareOut({
        orgId: "org-1",
        actorId: "actor-1",
        shareOutId: "shareout-1",
        reason: "Acta corrigió reparto anual",
        createArtifact,
      })).resolves.toMatchObject({
        reversed: false,
        reversalId: "reversal-1",
        shareOutId: "shareout-1",
        offsetsCreated: 0,
        supersedingArchiveIds: ["archive-new-1"],
      });
    });

    expect(createArtifact).not.toHaveBeenCalled();
    expect(insertedRows(fakeDb, statementArchive)).toEqual([]);
    expect(insertedRows(fakeDb, statementArchiveSupersession)).toEqual([
      expect.objectContaining({
        supersededStatementArchiveId: "archive-1",
        supersedingStatementArchiveId: "archive-new-1",
        yearEndShareOutReversalId: "reversal-1",
      }),
    ]);
  });
});

describe("share-out live regularized ceiling with PostgreSQL", () => {
  const actorId = randomUUID();
  const orgAllowed = randomUUID();
  const orgBlocked = randomUUID();
  const memberByOrg = new Map([[orgAllowed, randomUUID()], [orgBlocked, randomUUID()]]);
  const cycleByOrg = new Map([[orgAllowed, randomUUID()], [orgBlocked, randomUUID()]]);
  const closeByOrg = new Map([[orgAllowed, randomUUID()], [orgBlocked, randomUUID()]]);
  const decisionByOrg = new Map([[orgAllowed, randomUUID()], [orgBlocked, randomUUID()]]);
  let db: typeof import("@mi-banquito/db")["db"];

  beforeAll(async () => {
    expect(process.env.DATABASE_URL, "real PostgreSQL is required").toBeTruthy();
    ({ db } = await import("@mi-banquito/db"));
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      for (const [orgId, repartoTotal] of [[orgAllowed, "90.0000"], [orgBlocked, "100.0001"]] as const) {
        const memberId = memberByOrg.get(orgId)!;
        const cycleId = cycleByOrg.get(orgId)!;
        const closeId = closeByOrg.get(orgId)!;
        const reconciliationId = randomUUID();
        await tx.execute(sql`
          INSERT INTO organization (id, display_name, country_code, currency_code, timezone, default_language,
            status, created_at, created_by, created_by_kind)
          VALUES (${orgId}, ${`Share-out ${orgId}`}, 'EC', 'USD', 'America/Guayaquil', 'es-EC',
            'active', now(), ${actorId}, 'system')
        `);
        await tx.execute(sql`
          INSERT INTO member (id, org_id, display_name, joined_on, role, status, initial_savings_balance,
            created_at, created_by, created_by_kind)
          VALUES (${memberId}, ${orgId}, 'Share-out member', '2026-01-01', 'aportante', 'activo', 0,
            now(), ${actorId}, 'member')
        `);
        await tx.execute(sql`
          INSERT INTO account (org_id, name, type, is_group_fund, status, created_at, created_by)
          VALUES (${orgId}, 'Group bank', 'group_bank', true, 'active', now(), ${actorId})
        `);
        await tx.execute(sql`
          INSERT INTO contribution_cycle (id, org_id, cycle_label, kind, opens_on, closes_on,
            expected_amount_per_member, currency_code, status, created_at, created_by, created_by_kind)
          VALUES (${cycleId}, ${orgId}, 'FY 2026', 'annual', '2026-01-01', '2026-12-31', 100,
            'USD', 'closed', now(), ${actorId}, 'member')
        `);
        await tx.execute(sql`
          INSERT INTO contribution (org_id, cycle_id, member_id, amount, currency_code, dated_on,
            recorded_at, reconciliation_status, created_at, created_by, created_by_kind)
          VALUES (${orgId}, ${cycleId}, ${memberId}, 100, 'USD', '2026-01-02', now(), 'regularized',
            now(), ${actorId}, 'member')
        `);
        await tx.execute(sql`
          INSERT INTO group_config (org_id, version, valid_from, valid_to, contribution_cycle_kind,
            contribution_amount, currency_code, loan_rate_model, loan_rate_value, loan_rate_period_unit,
            loan_grace_periods, loan_to_savings_cap_ratio, interest_resolution, repayment_split_rule,
            pays_savings_interest, savings_interest_rate, year_end_share_out_formula, safety_margin_amount,
            reconciliation_tolerance_amount, late_threshold_days, mora_threshold_days, fiscal_year_start_month,
            fiscal_year_start_day, config, created_at, created_by, created_by_kind)
          VALUES (${orgId}, 1, '2026-01-01', NULL, 'monthly', 100, 'USD', 'declining_balance', 1,
            'monthly', 0, 3, 'daily', 'interest_first', false, NULL, 'two_pool_v1', 0, 0, 1, 5, 1, 1,
            '{}'::jsonb, now(), ${actorId}, 'member')
        `);
        await tx.execute(sql`
          INSERT INTO reconciliation_cycle (id, org_id, cycle_id, declared_bank_balance,
            computed_pool_balance, discrepancy_amount, tolerance_amount, resolution_kind, created_at,
            created_by, created_by_kind)
          VALUES (${reconciliationId}, ${orgId}, ${cycleId}, 100, 100, 0, 0, 'auto_within_tolerance', now(),
            ${actorId}, 'member')
        `);
        await tx.execute(sql`
          INSERT INTO period_close (id, org_id, cycle_id, reconciliation_cycle_id, closed_at, closed_by,
            closed_by_kind, is_year_end, created_at)
          VALUES (${closeId}, ${orgId}, ${cycleId}, ${reconciliationId}, '2027-01-01', ${actorId},
            'member', true, now())
        `);
        await tx.execute(sql`
          INSERT INTO surplus_governance_decision (id, org_id, year, version, valid_from, valid_to,
            distributable_surplus, reparto_total, reserva_amount, reserva_disposition, loan_pool_pct,
            savings_pool_pct, status, decided_at, decided_by, decided_by_kind, created_at)
          VALUES (${decisionByOrg.get(orgId)!}, ${orgId}, 2026, 1, '2027-01-01', NULL, ${repartoTotal},
            ${repartoTotal}, 0, 'capital', 0.3, 0.7, 'approved', '2027-01-01', ${actorId}, 'member', now())
        `);
      }
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      for (const orgId of [orgAllowed, orgBlocked]) {
        await tx.execute(sql`DELETE FROM audit_log_entry WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM year_end_share_out_line WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM year_end_share_out WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM surplus_governance_decision WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM period_close WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM reconciliation_cycle WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM contribution WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM contribution_cycle WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM group_config WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM account WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM member WHERE org_id = ${orgId}`);
        await tx.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
      }
      await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_member_time_weighted_balance`);
      await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_loan_activity_points`);
      await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_distributable_surplus`);
    });
  });

  it("stores the exact live close-date ceiling and replays one concurrent client request", async () => {
    const { createShareOutService } = await import("./shareout");
    const clientRequestId = randomUUID();
    const service = createShareOutService({ now: () => new Date("2027-01-02T12:00:00.000Z") });
    const command = { orgId: orgAllowed, actorId, year: 2026, clientRequestId };
    const [first, replay] = await Promise.all([service.runDraft(command), service.runDraft(command)]);

    expect(replay).toEqual(first);
    const result = await db.execute<{ count: string; totalPoolAtRun: string }>(sql`
      SELECT count(*)::text AS count, max(total_pool_at_run)::text AS "totalPoolAtRun"
      FROM year_end_share_out WHERE org_id = ${orgAllowed} AND year = 2026
    `);
    const row = (Array.isArray(result) ? result : result.rows)[0];
    expect(row).toEqual({ count: "1", totalPoolAtRun: "100.0000" });
    await expect(service.runDraft({ ...command, year: 2025 })).rejects.toThrow("share_out_idempotency_conflict");
    await expect(service.runDraft({ ...command, actorId: randomUUID() })).rejects.toThrow("share_out_idempotency_conflict");
  });

  it.each(["", "not-a-uuid"])("rejects invalid client request id %j before any write or audit", async (clientRequestId) => {
    const { createShareOutService } = await import("./shareout");
    await expect(createShareOutService().runDraft({
      orgId: orgBlocked,
      actorId,
      year: 2026,
      clientRequestId,
    })).rejects.toThrow("share_out_client_request_id_invalid");
    const result = await db.execute<{ shareOuts: string; audits: string }>(sql`
      SELECT
        (SELECT count(*) FROM year_end_share_out WHERE org_id = ${orgBlocked})::text AS "shareOuts",
        (SELECT count(*) FROM audit_log_entry WHERE org_id = ${orgBlocked}
          AND action_kind = 'shareout.draft.created')::text AS audits
    `);
    expect((Array.isArray(result) ? result : result.rows)[0]).toEqual({ shareOuts: "0", audits: "0" });
  });

  it("rejects an approved reparto above the exact live regularized balance without partial rows", async () => {
    const { createShareOutService } = await import("./shareout");
    await expect(createShareOutService().runDraft({
      orgId: orgBlocked,
      actorId,
      year: 2026,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("share_out_exceeds_regularized_balance");

    const result = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM year_end_share_out WHERE org_id = ${orgBlocked}
    `);
    expect((Array.isArray(result) ? result : result.rows)[0]?.count).toBe("0");
  });

  it("does not let another tenant's larger pool satisfy the ceiling", async () => {
    const result = await db.execute<{ allowed: string; blocked: string }>(sql`
      SELECT fund_pool_balance(${orgAllowed}, '2026-12-31')::text AS allowed,
        fund_pool_balance(${orgBlocked}, '2026-12-31')::text AS blocked
    `);
    expect((Array.isArray(result) ? result : result.rows)[0]).toEqual({ allowed: "100.0000", blocked: "100.0000" });
  });

  it("rolls back the whole draft when its audit append fails", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`
        UPDATE surplus_governance_decision SET reparto_total = 90, distributable_surplus = 90
        WHERE id = ${decisionByOrg.get(orgBlocked)!}
      `);
    });
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION task14_reject_shareout_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action_kind = 'shareout.draft.created' THEN RAISE EXCEPTION 'task14 audit rejection'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER task14_reject_shareout_audit
      BEFORE INSERT ON audit_log_entry FOR EACH ROW EXECUTE FUNCTION task14_reject_shareout_audit();
    `));
    try {
      const { createShareOutService } = await import("./shareout");
      await expect(createShareOutService().runDraft({
        orgId: orgBlocked,
        actorId,
        year: 2026,
        clientRequestId: randomUUID(),
      })).rejects.toThrow("task14 audit rejection");
    } finally {
      await db.execute(sql.raw(`
        DROP TRIGGER IF EXISTS task14_reject_shareout_audit ON audit_log_entry;
        DROP FUNCTION IF EXISTS task14_reject_shareout_audit();
      `));
    }
    const rows = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM year_end_share_out WHERE org_id = ${orgBlocked}
    `);
    expect((Array.isArray(rows) ? rows : rows.rows)[0]?.count).toBe("0");
  });
});
