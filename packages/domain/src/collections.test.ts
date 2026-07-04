import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  buildChaseMessage,
  buildWhatsAppChaseUrl,
  createCollectionsService,
  defaultPromiseDate,
  normalizePromiseSourceRef,
  promiseReminderCandidates,
  sortAgingRows,
} from "./collections";
import { alert, arAging, auditLogEntry, organization, promise, promiseReminder } from "@mi-banquito/db/schema";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type SelectRecord = {
  context: string;
  tableName: string;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeSelectBuilder {
  private tableName: string | null = null;

  constructor(
    private readonly context: string,
    private readonly selects: SelectRecord[],
    private readonly nextResult: (tableName: string) => unknown[],
  ) {}

  from(table: unknown) {
    this.tableName = tableNameOf(table);
    this.selects.push({ context: this.context, tableName: this.tableName });
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
    return Promise.resolve(this.nextResult(this.tableName ?? "")).then(onfulfilled, onrejected);
  }
}

class FakeInsertBuilder {
  private returningRows: unknown[];

  constructor(
    private readonly table: unknown,
    private readonly inserts: InsertRecord[],
    nextReturning: (tableName: string) => unknown[],
  ) {
    this.returningRows = nextReturning(tableNameOf(table));
  }

  values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.inserts.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  onConflictDoNothing() {
    return this;
  }

  returning() {
    return Promise.resolve(this.returningRows);
  }
}

class FakeUpdateBuilder {
  set() {
    return this;
  }

  where() {
    return Promise.resolve([]);
  }
}

class FakeDb {
  readonly inserts: InsertRecord[] = [];
  readonly selects: SelectRecord[] = [];
  private readonly insertReturningByTableName: Record<string, unknown[][]>;
  private readonly selectResultsByTableName: Record<string, unknown[][]>;

  constructor(
    readonly context: string,
    selectResultsByTableName: Record<string, unknown[][]> = {},
    insertReturningByTableName: Record<string, unknown[][]> = {},
  ) {
    this.selectResultsByTableName = { ...selectResultsByTableName };
    this.insertReturningByTableName = { ...insertReturningByTableName };
  }

  select() {
    return new FakeSelectBuilder(this.context, this.selects, (tableName) => (
      this.selectResultsByTableName[tableName]?.shift() ?? []
    ));
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts, (tableName) => (
      this.insertReturningByTableName[tableName]?.shift() ?? []
    ));
  }

  update() {
    return new FakeUpdateBuilder();
  }
}

function insertedRows(fakeDbs: FakeDb | FakeDb[], table: unknown): Array<Record<string, unknown>> {
  return [fakeDbs].flat()
    .flatMap((fakeDb) => fakeDb.inserts)
    .filter((entry) => entry.tableName === tableNameOf(table))
    .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);
}

async function withMockedCollectionsDb<T>(
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

describe("collections", () => {
  if (false) {
    // @ts-expect-error Public date helper inputs are date-only strings, not Date objects.
    defaultPromiseDate(new Date());
    // @ts-expect-error Reminder promised dates are date-only strings, not Date objects.
    promiseReminderCandidates([{ status: "open", promisedOn: new Date() }], "2026-07-04");
  }

  it("sorts aging rows by days late descending by default", () => {
    expect(sortAgingRows([
      { id: "due-2", daysLate: 2 },
      { id: "due-9", daysLate: 9 },
      { id: "due-5", daysLate: 5 },
    ])).toEqual([
      { id: "due-9", daysLate: 9 },
      { id: "due-5", daysLate: 5 },
      { id: "due-2", daysLate: 2 },
    ]);
  });

  it("sorts aging row ties deterministically by member, due date, and id", () => {
    expect(sortAgingRows([
      { id: "b-loan", memberName: "Zoila", dueDate: "2026-07-01", daysLate: 9 },
      { id: "c-loan", memberName: "Ana", dueDate: "2026-07-02", daysLate: 9 },
      { id: "a-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "late", memberName: "Belen", dueDate: "2026-06-01", daysLate: 12 },
      { id: "d-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
    ])).toEqual([
      { id: "late", memberName: "Belen", dueDate: "2026-06-01", daysLate: 12 },
      { id: "a-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "d-loan", memberName: "Ana", dueDate: "2026-07-01", daysLate: 9 },
      { id: "c-loan", memberName: "Ana", dueDate: "2026-07-02", daysLate: 9 },
      { id: "b-loan", memberName: "Zoila", dueDate: "2026-07-01", daysLate: 9 },
    ]);
  });

  it("preserves input order for minimal aging row ties", () => {
    const first = { daysLate: 3 };
    const second = { daysLate: 3 };

    expect(sortAgingRows([first, second])).toEqual([first, second]);
  });

  it("defaults promise dates to seven days after today", () => {
    expect(defaultPromiseDate("2026-07-04")).toBe("2026-07-11");
  });

  it("defaults promise dates across month and year rollover", () => {
    expect(defaultPromiseDate("2026-01-29")).toBe("2026-02-05");
    expect(defaultPromiseDate("2026-12-28")).toBe("2027-01-04");
  });

  it("rejects impossible date-only values instead of rolling them forward", () => {
    expect(() => defaultPromiseDate("2026-02-30")).toThrow("date_must_be_valid");
    expect(() => promiseReminderCandidates([
      { id: "bad", status: "open", promisedOn: "2026-02-30" },
    ], "2026-07-04")).toThrow("date_must_be_valid");
    expect(() => promiseReminderCandidates([], "2026-13-01")).toThrow("date_must_be_valid");
  });

  it("normalizes overdue row source refs to exactly one promise source", () => {
    expect(normalizePromiseSourceRef({ sourceKind: "loan", sourceId: "loan-1" })).toEqual({
      loanId: "loan-1",
      cycleId: null,
    });
    expect(normalizePromiseSourceRef({ sourceKind: "cycle", sourceId: "cycle-1" })).toEqual({
      loanId: null,
      cycleId: "cycle-1",
    });
    expect(() => normalizePromiseSourceRef({ sourceKind: "loan", sourceId: "" })).toThrow("promise_source_required");
    expect(() => normalizePromiseSourceRef({ loanId: "loan-1", cycleId: "cycle-1" }))
      .toThrow("promise_source_must_be_exactly_one");
    expect(() => normalizePromiseSourceRef({ loanId: null, cycleId: null }))
      .toThrow("promise_source_must_be_exactly_one");
  });

  it("trims source IDs before normalizing promise source refs", () => {
    expect(normalizePromiseSourceRef({ sourceKind: "loan", sourceId: " loan-1 " })).toEqual({
      loanId: "loan-1",
      cycleId: null,
    });
    expect(normalizePromiseSourceRef({ loanId: " loan-2 ", cycleId: null })).toEqual({
      loanId: "loan-2",
      cycleId: null,
    });
  });

  it("builds warm Spanish WhatsApp chase copy for aporte rows", () => {
    expect(buildChaseMessage({
      memberName: "María",
      reasonKind: "aporte",
      periodLabel: "julio 2026",
    })).toBe("Hola María, te comparto que tu aporte de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("keeps backwards compatibility for previous chase copy input names", () => {
    expect(buildChaseMessage({
      member: "María",
      obligationKind: "cuota",
      period: "julio 2026",
    })).toBe("Hola María, te comparto que tu cuota de julio 2026 aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.");
  });

  it("builds wa.me chase URLs only when a number exists", () => {
    const message = buildChaseMessage({
      memberName: "María",
      reasonKind: "aporte",
      periodLabel: "julio 2026",
    });

    expect(buildWhatsAppChaseUrl({ whatsappNumber: "+593 99 123 4567", message }))
      .toBe("https://wa.me/593991234567?text=Hola%20Mar%C3%ADa%2C%20te%20comparto%20que%20tu%20aporte%20de%20julio%202026%20a%C3%BAn%20est%C3%A1%20pendiente.%20%C2%BFCu%C3%A1ndo%20crees%20poder%20hacerlo%3F%20-%20Mi%20Banquito.");
    expect(buildWhatsAppChaseUrl({ whatsappNumber: null, message })).toBeNull();
    expect(buildWhatsAppChaseUrl({ whatsappNumber: "   ", message })).toBeNull();
  });

  it("does not build wa.me URLs for invalid blank WhatsApp numbers", () => {
    expect(buildWhatsAppChaseUrl({ whatsappNumber: " + - () ", message: "Hola" })).toBeNull();
  });

  it("returns only open due promises for reminder candidates", () => {
    expect(promiseReminderCandidates([
      { id: "due-yesterday", status: "open", promisedOn: "2026-07-03" },
      { id: "due-today", status: "open", promisedOn: "2026-07-04" },
      { id: "future", status: "open", promisedOn: "2026-07-05" },
      { id: "kept", status: "kept", promisedOn: "2026-07-04" },
      { id: "broken", status: "broken", promisedOn: "2026-07-01" },
    ], "2026-07-04")).toEqual([
      { id: "due-yesterday", status: "open", promisedOn: "2026-07-03" },
      { id: "due-today", status: "open", promisedOn: "2026-07-04" },
    ]);
  });

  it("exposes the collections service boundary without opening a DB connection", () => {
    const service = createCollectionsService();

    expect(service.context).toBe("collections");
    expect(service.listAgingRows).toEqual(expect.any(Function));
    expect(service.markPromise).toEqual(expect.any(Function));
    expect(service.recordChaseAttempt).toEqual(expect.any(Function));
    expect(service.emitPromiseReminders).toEqual(expect.any(Function));
  });

  it("emits promise reminders by opening tenant transactions per active organization", async () => {
    const orgRows = [{ id: "org-1" }, { id: "org-2" }];
    const org1Promise = {
      id: "promise-1",
      orgId: "org-1",
      memberId: "member-1",
      loanId: "loan-1",
      cycleId: null,
      promisedOn: "2026-07-04",
      status: "open",
    };
    const org2Promise = {
      id: "promise-2",
      orgId: "org-2",
      memberId: "member-2",
      loanId: null,
      cycleId: "cycle-2",
      promisedOn: "2026-07-03",
      status: "open",
    };
    const systemDb = new FakeDb("system", {
      [tableNameOf(organization)]: [orgRows],
    });
    const tenantDbs = {
      "org-1": new FakeDb("tenant:org-1", {
        [tableNameOf(promise)]: [[org1Promise]],
      }, {
        [tableNameOf(promiseReminder)]: [[{ id: "reminder-1" }]],
      }),
      "org-2": new FakeDb("tenant:org-2", {
        [tableNameOf(promise)]: [[org2Promise]],
      }, {
        [tableNameOf(promiseReminder)]: [[{ id: "reminder-2" }]],
      }),
    };
    const tenantCalls: string[] = [];

    await withMockedCollectionsDb({ systemDb, tenantDbs, tenantCalls }, async () => {
      const { createCollectionsService: createDynamicCollectionsService } = await import("./collections");

      await expect(createDynamicCollectionsService().emitPromiseReminders("2026-07-04"))
        .resolves.toEqual({ promisesScanned: 2, remindersEmitted: 2 });
    });

    expect(tenantCalls).toEqual(["org-1", "org-2"]);
    expect(systemDb.selects).toEqual([{ context: "system", tableName: tableNameOf(organization) }]);
    expect(tenantDbs["org-1"].selects).toEqual([{ context: "tenant:org-1", tableName: tableNameOf(promise) }]);
    expect(tenantDbs["org-2"].selects).toEqual([{ context: "tenant:org-2", tableName: tableNameOf(promise) }]);
  });

  it("does not create alert or audit rows when an existing promise reminder conflicts", async () => {
    const duePromise = {
      id: "promise-1",
      orgId: "org-1",
      memberId: "member-1",
      loanId: "loan-1",
      cycleId: null,
      promisedOn: "2026-07-04",
      status: "open",
    };
    const systemDb = new FakeDb("system", {
      [tableNameOf(organization)]: [[{ id: "org-1" }]],
    });
    const tenantDb = new FakeDb("tenant:org-1", {
      [tableNameOf(promise)]: [[duePromise]],
    }, {
      [tableNameOf(promiseReminder)]: [[]],
    });

    await withMockedCollectionsDb({ systemDb, tenantDbs: { "org-1": tenantDb } }, async () => {
      const { createCollectionsService: createDynamicCollectionsService } = await import("./collections");

      await expect(createDynamicCollectionsService().emitPromiseReminders("2026-07-04"))
        .resolves.toEqual({ promisesScanned: 1, remindersEmitted: 0 });
    });

    expect(insertedRows(tenantDb, promiseReminder)).toHaveLength(1);
    expect(insertedRows(tenantDb, alert)).toHaveLength(0);
    expect(insertedRows(tenantDb, auditLogEntry)).toHaveLength(0);
  });

  it("rejects marking a promise for a source obligation that is not in aging rows", async () => {
    const systemDb = new FakeDb("system");
    const tenantDb = new FakeDb("tenant:org-1", {
      [tableNameOf(arAging)]: [[]],
    });

    await withMockedCollectionsDb({ systemDb, tenantDbs: { "org-1": tenantDb } }, async () => {
      const { createCollectionsService: createDynamicCollectionsService } = await import("./collections");

      await expect(createDynamicCollectionsService().markPromise({
        orgId: "org-1",
        actorId: "actor-1",
        memberId: "member-1",
        loanId: "loan-1",
        promisedOn: "2026-07-11",
        todayIso: "2026-07-04",
      })).rejects.toThrow("collections_obligation_not_found");
    });

    expect(tenantDb.selects).toEqual([{ context: "tenant:org-1", tableName: tableNameOf(arAging) }]);
    expect(insertedRows(tenantDb, promise)).toHaveLength(0);
    expect(insertedRows(tenantDb, auditLogEntry)).toHaveLength(0);
  });
});
