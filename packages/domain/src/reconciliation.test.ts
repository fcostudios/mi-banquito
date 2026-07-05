import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  alert,
  auditLogEntry,
  contributionCycle,
  periodClose,
  reconciliationCycle,
  statementArchive,
} from "@mi-banquito/db/schema";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeSelectBuilder {
  private tableName: string | undefined;

  constructor(
    private readonly nextResult: () => unknown[],
    private readonly rememberSelection: (tableName: string | undefined, rows: unknown[]) => void,
  ) {}

  from(table?: unknown) {
    this.tableName = table ? tableNameOf(table) : undefined;
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
    const rows = this.nextResult();
    this.rememberSelection(this.tableName, rows);
    return Promise.resolve(rows).then(onfulfilled, onrejected);
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

  onConflictDoNothing() {
    return this;
  }

  returning() {
    const inserted = this.inserts.at(-1)?.values;
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return Promise.resolve([{ id: "77777777-7777-4777-8777-777777777777", ...row }]);
  }
}

class FakeUpdateBuilder {
  private patch: Record<string, unknown> = {};

  constructor(
    private readonly table: unknown,
    private readonly updates: InsertRecord[],
    private readonly lastSelected: (tableName: string) => Record<string, unknown>,
  ) {}

  set(values: Record<string, unknown>) {
    this.patch = values;
    return this;
  }

  where() {
    return this;
  }

  returning() {
    const row = { ...this.lastSelected(tableNameOf(this.table)), ...this.patch };
    this.updates.push({ tableName: tableNameOf(this.table), values: row });
    return Promise.resolve([row]);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: InsertRecord[] = [];
  private readonly selectResults: unknown[][];
  private readonly selectedByTable = new Map<string, unknown[]>();

  constructor(selectResults: unknown[][]) {
    this.selectResults = [...selectResults];
  }

  select() {
    return new FakeSelectBuilder(
      () => this.selectResults.shift() ?? [],
      (tableName, rows) => {
        if (tableName) {
          this.selectedByTable.set(tableName, rows);
        }
      },
    );
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
  }

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates, (tableName) => {
      const [row] = this.selectedByTable.get(tableName) ?? [];
      return row && typeof row === "object" && !Array.isArray(row)
        ? row as Record<string, unknown>
        : {};
    });
  }

  async transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
    const snapshot = [...this.inserts];
    const updateSnapshot = [...this.updates];
    try {
      return await callback(this);
    } catch (error) {
      this.inserts.splice(0, this.inserts.length, ...snapshot);
      this.updates.splice(0, this.updates.length, ...updateSnapshot);
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
  .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);

const mockTenantDb = (fakeDb: FakeDb) => {
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  vi.doMock("@mi-banquito/db/tenant", () => ({
    withTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) =>
      fakeDb.transaction(run),
    withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeDb) => Promise<unknown>) =>
      fakeDb.transaction(run),
  }));
};

const unmockTenantDb = () => {
  vi.doUnmock("@mi-banquito/db");
  vi.doUnmock("@mi-banquito/db/tenant");
  vi.resetModules();
};

describe("adjustment window reconciliation", () => {
  it("computes discrepancy and status at tolerance boundaries", async () => {
    const { classifyReconciliation } = await import("./reconciliation");

    expect(classifyReconciliation({
      declaredBankBalance: "100.00",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "0.0000",
      status: "within_tolerance",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "99.50",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-0.5000",
      status: "within_tolerance",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "98.99",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-1.0100",
      status: "outside_tolerance",
      closeAllowed: false,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "98.99",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "annotated_acceptance",
      periodCloseId: null,
    })).toEqual({
      discrepancyAmount: "-1.0100",
      status: "annotated",
      closeAllowed: true,
    });

    expect(classifyReconciliation({
      declaredBankBalance: "100.00",
      computedPoolBalance: "100.00",
      toleranceAmount: "0.50",
      resolutionKind: "auto_within_tolerance",
      periodCloseId: "22222222-2222-4222-8222-222222222222",
    })).toEqual({
      discrepancyAmount: "0.0000",
      status: "closed",
      closeAllowed: false,
    });
  });

  it("upserts the current cycle reconciliation and emits one A7 alert when outside tolerance", async () => {
    const now = new Date("2026-07-05T10:00:00.000Z");
    const fakeDb = new FakeDb([
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "julio 2026",
        opensOn: "2026-07-01",
        closesOn: "2026-07-31",
        status: "open",
      }],
      [],
      [{ reconciliationToleranceAmount: "0.5000" }],
      [{
        amount: "100.0000",
      }, {
        amount: "50.0000",
      }],
      [{ amount: "25.0000" }],
      [{ amount: "20.0000" }],
      [{ amount: "10.0000" }],
      [{ amount: "20.0000" }],
      [],
      [],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      const result = await createReconciliationService({ now: () => now }).executeReconciliation({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        cycleId: "44444444-4444-4444-8444-444444444444",
        declaredBankBalance: "120.0000",
      });

      expect(result).toMatchObject({
        cycleId: "44444444-4444-4444-8444-444444444444",
        cycleLabel: "julio 2026",
        declaredBankBalance: "120.0000",
        computedPoolBalance: "125.0000",
        discrepancyAmount: "-5.0000",
        toleranceAmount: "0.5000",
        status: "outside_tolerance",
      });

      expect(insertedRows(fakeDb, reconciliationCycle)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          cycleId: "44444444-4444-4444-8444-444444444444",
          declaredBankBalance: "120.0000",
          computedPoolBalance: "125.0000",
          discrepancyAmount: "-5.0000",
          toleranceAmount: "0.5000",
          resolutionKind: "auto_within_tolerance",
          createdBy: "33333333-3333-4333-8333-333333333333",
          createdByKind: "member",
        }),
      ]);
      expect(insertedRows(fakeDb, alert)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          alertKind: "A7",
          severity: "critical",
          audience: "treasurer",
          subjectKind: "reconciliation_cycle",
          createdAt: now,
        }),
      ]);
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
        expect.objectContaining({
          actionKind: "reconciliation.execute",
          subjectKind: "reconciliation_cycle",
        }),
      ]);
    } finally {
      unmockTenantDb();
    }
  });

  it("requires a 10 character annotation reason and enables close after annotation", async () => {
    const now = new Date("2026-07-05T10:00:00.000Z");
    const reconciliationRow = {
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "120.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "-5.0000",
      toleranceAmount: "0.5000",
      resolutionKind: "auto_within_tolerance",
      resolutionNote: null,
      periodCloseId: null,
    };
    const fakeDb = new FakeDb([
      [reconciliationRow],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "julio 2026",
        opensOn: "2026-07-01",
      }],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      const service = createReconciliationService({ now: () => now });

      await expect(service.annotateReconciliation({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
        reason: "muy corto",
      })).rejects.toThrow("annotation_reason_min_length");

      await expect(service.annotateReconciliation({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
        reason: "Banco reportó comisión pendiente",
      })).resolves.toMatchObject({
        id: "55555555-5555-4555-8555-555555555555",
        status: "annotated",
        resolutionKind: "annotated_acceptance",
        resolutionNote: "Banco reportó comisión pendiente",
      });

      expect(updatedRows(fakeDb, reconciliationCycle)).toEqual([
        expect.objectContaining({
          resolutionKind: "annotated_acceptance",
          resolutionNote: "Banco reportó comisión pendiente",
        }),
      ]);
    } finally {
      unmockTenantDb();
    }
  });

  it("closes an annotated reconciliation, writes statement archive, and is idempotent by cycle", async () => {
    const closedAt = new Date("2026-07-05T12:00:00.000Z");
    const reconciliationRow = {
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "120.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "-5.0000",
      toleranceAmount: "0.5000",
      resolutionKind: "annotated_acceptance",
      resolutionNote: "Banco reportó comisión pendiente",
      periodCloseId: null,
    };
    const fakeDb = new FakeDb([
      [reconciliationRow],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "junio 2026",
        opensOn: "2026-06-01",
        closesOn: "2026-06-30",
        status: "open",
      }],
      [],
      [],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      const close = await createReconciliationService({
        now: () => closedAt,
        monthlyCloseArtifactWriter: async ({ canonicalPayloadHash }) => ({
          pdfUri: `https://blob.vercel-storage.com/monthly-close/${canonicalPayloadHash}.pdf`,
          byteSize: 2048,
        }),
      }).closePeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      });

      expect(close).toMatchObject({
        periodCloseId: expect.any(String),
        monthlyClosePdfUri: expect.stringContaining("https://blob.vercel-storage.com/monthly-close/"),
        status: "closed",
      });
      expect(insertedRows(fakeDb, periodClose)).toHaveLength(1);
      expect(insertedRows(fakeDb, statementArchive)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          kind: "monthly_close",
          periodLabel: "junio 2026",
          pdfUri: expect.stringContaining("https://blob.vercel-storage.com/monthly-close/"),
          canonicalPayloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          byteSize: 2048,
          createdByKind: "system",
        }),
      ]);
      expect(updatedRows(fakeDb, contributionCycle)).toEqual([
        expect.objectContaining({
          id: "44444444-4444-4444-8444-444444444444",
          status: "closed",
        }),
      ]);
      expect(updatedRows(fakeDb, periodClose)).toEqual([
        expect.objectContaining({
          monthlyCloseStatementId: "77777777-7777-4777-8777-777777777777",
        }),
      ]);
    } finally {
      unmockTenantDb();
    }
  });

  it("rejects closing the current contribution cycle", async () => {
    const closedAt = new Date("2026-07-05T12:00:00.000Z");
    const reconciliationRow = {
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "125.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "0.0000",
      toleranceAmount: "0.5000",
      resolutionKind: "auto_within_tolerance",
      resolutionNote: null,
      periodCloseId: null,
    };
    const fakeDb = new FakeDb([
      [reconciliationRow],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "julio 2026",
        opensOn: "2026-07-01",
        closesOn: "2026-07-31",
        status: "open",
      }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService({
        now: () => closedAt,
        monthlyCloseArtifactWriter: async ({ canonicalPayloadHash }) => ({
          pdfUri: `https://blob.vercel-storage.com/monthly-close/${canonicalPayloadHash}.pdf`,
          byteSize: 2048,
        }),
      }).closePeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      })).rejects.toThrow("contribution_cycle_not_past");

      expect(insertedRows(fakeDb, periodClose)).toHaveLength(0);
      expect(insertedRows(fakeDb, statementArchive)).toHaveLength(0);
    } finally {
      unmockTenantDb();
    }
  });

  it("rejects closing a malformed same-day contribution cycle", async () => {
    const closedAt = new Date("2026-07-05T12:00:00.000Z");
    const reconciliationRow = {
      id: "55555555-5555-4555-8555-555555555555",
      orgId: "11111111-1111-4111-8111-111111111111",
      cycleId: "44444444-4444-4444-8444-444444444444",
      declaredBankBalance: "125.0000",
      computedPoolBalance: "125.0000",
      discrepancyAmount: "0.0000",
      toleranceAmount: "0.5000",
      resolutionKind: "auto_within_tolerance",
      resolutionNote: null,
      periodCloseId: null,
    };
    const fakeDb = new FakeDb([
      [reconciliationRow],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "julio 2026",
        opensOn: "2026-07-01",
        closesOn: "2026-07-01",
        status: "open",
      }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService({
        now: () => closedAt,
        monthlyCloseArtifactWriter: async ({ canonicalPayloadHash }) => ({
          pdfUri: `https://blob.vercel-storage.com/monthly-close/${canonicalPayloadHash}.pdf`,
          byteSize: 2048,
        }),
      }).closePeriod({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
      })).rejects.toThrow("contribution_cycle_not_past");

      expect(insertedRows(fakeDb, periodClose)).toHaveLength(0);
      expect(insertedRows(fakeDb, statementArchive)).toHaveLength(0);
    } finally {
      unmockTenantDb();
    }
  });

  it("shows the latest closed monthly close when no past open cycle remains", async () => {
    const fakeDb = new FakeDb([
      [],
      [{
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        declaredBankBalance: "125.0000",
        computedPoolBalance: "125.0000",
        discrepancyAmount: "0.0000",
        toleranceAmount: "0.5000",
        resolutionKind: "auto_within_tolerance",
        resolutionNote: null,
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        closedAt: new Date("2026-07-05T12:00:00.000Z"),
      }],
      [{
        id: "44444444-4444-4444-8444-444444444444",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleLabel: "junio 2026",
        opensOn: "2026-06-01",
        closesOn: "2026-06-30",
        status: "closed",
      }],
      [{
        id: "22222222-2222-4222-8222-222222222222",
        orgId: "11111111-1111-4111-8111-111111111111",
        cycleId: "44444444-4444-4444-8444-444444444444",
        reconciliationCycleId: "55555555-5555-4555-8555-555555555555",
        closedAt: new Date("2026-07-05T12:00:00.000Z"),
      }],
      [{
        id: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
        kind: "monthly_close",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        pdfUri: "https://blob.vercel-storage.com/monthly-close.pdf",
        canonicalPayloadHash: "a".repeat(64),
      }],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService({
        now: () => new Date("2026-07-05T12:00:00.000Z"),
      }).getMonthlyCloseState("11111111-1111-4111-8111-111111111111")).resolves.toMatchObject({
        cycleLabel: "junio 2026",
        status: "closed",
        periodCloseId: "22222222-2222-4222-8222-222222222222",
        monthlyCloseStatementId: "99999999-9999-4999-8999-999999999999",
        monthlyClosePdfUri: "https://blob.vercel-storage.com/monthly-close.pdf",
      });
    } finally {
      unmockTenantDb();
    }
  });

  it("records monthly close WhatsApp share attempt and returns a WhatsApp URL", async () => {
    const fakeDb = new FakeDb([
      [{
        id: "99999999-9999-4999-8999-999999999999",
        orgId: "11111111-1111-4111-8111-111111111111",
        kind: "monthly_close",
        pdfUri: "https://blob.vercel-storage.com/monthly-close.pdf",
        canonicalPayloadHash: "a".repeat(64),
      }],
    ]);
    vi.resetModules();
    mockTenantDb(fakeDb);

    try {
      const { createReconciliationService } = await import("./reconciliation");
      await expect(createReconciliationService().recordMonthlyCloseShareAttempt({
        orgId: "11111111-1111-4111-8111-111111111111",
        actorId: "33333333-3333-4333-8333-333333333333",
        statementArchiveId: "99999999-9999-4999-8999-999999999999",
      })).resolves.toEqual({
        whatsappUrl: "https://wa.me/?text=Revisa%20el%20cierre%20del%20mes%3A%20https%3A%2F%2Fblob.vercel-storage.com%2Fmonthly-close.pdf",
      });

      expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
        expect.objectContaining({
          actionKind: "statement_archive.share_whatsapp",
          subjectKind: "statement_archive",
          subjectId: "99999999-9999-4999-8999-999999999999",
        }),
      ]);
    } finally {
      unmockTenantDb();
    }
  });

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
