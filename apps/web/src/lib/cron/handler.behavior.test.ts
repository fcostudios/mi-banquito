import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alert, loan, loanSchedule } from "@mi-banquito/db/schema";

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type UpdateRecord = {
  tableName: string;
  values: Record<string, unknown>;
  returnedRows?: unknown[];
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

  onConflictDoNothing() {
    return this;
  }
}

class FakeUpdateBuilder {
  private updateRecord: UpdateRecord | null = null;

  constructor(
    private readonly table: unknown,
    private readonly updates: UpdateRecord[],
    private readonly returningRows: () => unknown[],
  ) {}

  set(values: Record<string, unknown>) {
    this.updateRecord = { tableName: tableNameOf(this.table), values };
    this.updates.push(this.updateRecord);
    return this;
  }

  where() {
    return this;
  }

  returning() {
    const rows = this.returningRows();
    if (this.updateRecord) {
      this.updateRecord.returnedRows = rows;
    }
    return Promise.resolve(rows);
  }
}

class FakeCronDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: UpdateRecord[] = [];
  readonly executedQueries: unknown[] = [];
  private readonly selectResults: unknown[][];
  private readonly executeResults: Array<unknown[] | Error>;
  private readonly updateReturningResults: Record<string, unknown[][]>;

  constructor(args: { selectResults: unknown[][]; executeResults?: Array<unknown[] | Error>; updateReturningResults?: Record<string, unknown[][]> }) {
    this.selectResults = [...args.selectResults];
    this.executeResults = [...(args.executeResults ?? [])];
    this.updateReturningResults = Object.fromEntries(
      Object.entries(args.updateReturningResults ?? {}).map(([tableName, rows]) => [tableName, [...rows]]),
    );
  }

  select() {
    return new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
  }

  update(table: unknown) {
    const tableName = tableNameOf(table);
    return new FakeUpdateBuilder(table, this.updates, () => this.updateReturningResults[tableName]?.shift() ?? [{}]);
  }

  execute(query: unknown) {
    this.executedQueries.push(query);
    const result = this.executeResults.shift() ?? [];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve({ rows: result });
  }

  transaction<T>(callback: (tx: FakeCronDb) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function insertedRows(fakeDb: FakeCronDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.inserts
    .filter((entry) => entry.tableName === tableNameOf(table))
    .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);
}

function updatedRows(fakeDb: FakeCronDb, table: unknown): UpdateRecord[] {
  return fakeDb.updates.filter((entry) => entry.tableName === tableNameOf(table));
}

function successfulUpdatedRows(fakeDb: FakeCronDb, table: unknown): UpdateRecord[] {
  return updatedRows(fakeDb, table)
    .filter((entry) => entry.returnedRows === undefined || entry.returnedRows.length > 0);
}

const orgId = "11111111-1111-4111-8111-111111111111";
const loanId = "22222222-2222-4222-8222-222222222222";
const scheduleId = "33333333-3333-4333-8333-333333333333";

function overdueCronRows(loanStatus: "originated" | "en_mora") {
  return {
    org: { id: orgId },
    config: {
      orgId,
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      moraThresholdDays: 15,
      config: {
        mora: {
          scope: "loans",
          per_day_amount: "0.2500",
          cap: "none",
        },
      },
    },
    loan: {
      id: loanId,
      orgId,
      principalAmount: "100.0000",
      currencyCode: "USD",
      rateValue: "4.0000",
      originatedOn: "2026-05-01",
      status: loanStatus,
    },
    schedule: {
      id: scheduleId,
      dueOn: "2026-06-01",
      principalDue: "100.0000",
      interestDue: "4.0000",
      paidPrincipalToDate: "0.0000",
      paidInterestToDate: "0.0000",
      status: "atrasado",
    },
  };
}

async function importCronWithDb(fakeDb: FakeCronDb) {
  vi.resetModules();
  vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
  vi.doMock("@mi-banquito/domain", async () => {
    const actual = await import("../../../../../packages/domain/src/sprint7-alerts");
    return {
      buildA6LoanPastDueAlert: actual.buildA6LoanPastDueAlert,
      createAlertsService: vi.fn(),
      createCollectionsService: vi.fn(),
      createCompensationService: vi.fn(),
    };
  });
  return import("./handler");
}

afterEach(() => {
  vi.doUnmock("@mi-banquito/db");
  vi.doUnmock("@mi-banquito/domain");
  vi.resetModules();
});

describe("accrue-interest cron A6 alerts", () => {
  it("inserts an A6 treasurer alert with borrower context when a loan transitions into mora", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
      executeResults: [
        [{ loan_id: loanId, schedule_id: scheduleId, schedule_status: "atrasado" }],
        [{
          borrower_kind: "non_member",
          borrower_name: "Ana externa",
          guarantor_name: "Pancho",
          days_late: 30,
        }],
      ],
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(1);
    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A6",
        severity: "high",
        audience: "treasurer",
        subjectKind: "loan",
        subjectId: loanId,
        payload: expect.objectContaining({
          loanId,
          borrowerName: "Ana externa",
          borrowerKind: "non_member",
          guarantorName: "Pancho",
          daysLate: 30,
        }),
      }),
    ]);
  });

  it("does not insert A6 on a later daily run when the loan is already in mora", async () => {
    const rows = overdueCronRows("en_mora");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(0);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("inserts only one A6 alert for one loan during a multi-day replay transition", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
      executeResults: [
        [{ loan_id: loanId, schedule_id: scheduleId, schedule_status: "atrasado" }],
        [{
          borrower_kind: "member",
          borrower_name: "Pancho",
          guarantor_name: null,
          days_late: 30,
        }],
      ],
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-03"),
    );

    expect(summary.moraFeesPlanned).toBe(3);
    expect(summary.transitionsToMora).toBe(1);
    expect(insertedRows(fakeDb, alert)).toEqual([
      expect.objectContaining({
        alertKind: "A6",
        audience: "treasurer",
        subjectId: loanId,
        payload: expect.objectContaining({
          borrowerName: "Pancho",
          borrowerKind: "member",
          daysLate: 30,
        }),
      }),
    ]);
  });

  it("does not insert A6 when the atomic loan status update did not transition a row", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
      executeResults: [[{ loan_id: loanId, schedule_id: scheduleId, schedule_status: "atrasado" }]],
      updateReturningResults: { loan: [[]] },
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(1);
    expect(successfulUpdatedRows(fakeDb, loan)).toHaveLength(0);
    expect(updatedRows(fakeDb, loanSchedule).map((entry) => entry.values.status)).toEqual(["en_mora", "atrasado"]);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("does not overwrite a stale paid or canceled loan plan into mora", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
      updateReturningResults: { loan: [[]] },
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(1);
    expect(updatedRows(fakeDb, loanSchedule)).toHaveLength(0);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("does not overwrite loan or schedule status when the planned overdue schedule is already paid", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(1);
    expect(updatedRows(fakeDb, loan)).toHaveLength(0);
    expect(updatedRows(fakeDb, loanSchedule)).toHaveLength(0);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });

  it("does not leave the loan in mora when the guarded schedule update loses eligibility", async () => {
    const rows = overdueCronRows("originated");
    const fakeDb = new FakeCronDb({
      selectResults: [
        [rows.org],
        [rows.config],
        [rows.loan],
        [rows.schedule],
        [],
        [],
        [],
      ],
      executeResults: [[{ loan_id: loanId, schedule_id: scheduleId, schedule_status: "atrasado" }]],
      updateReturningResults: {
        loan: [[{ id: loanId }]],
        loan_schedule: [[]],
      },
    });
    const { runAccrueInterestCron } = await importCronWithDb(fakeDb);

    const summary = await runAccrueInterestCron(
      new Request("http://localhost/api/cron/accrue-interest?from_date=2026-07-01&to_date=2026-07-01"),
    );

    expect(summary.transitionsToMora).toBe(1);
    expect(successfulUpdatedRows(fakeDb, loan)).toHaveLength(0);
    expect(successfulUpdatedRows(fakeDb, loanSchedule)).toHaveLength(0);
    expect(insertedRows(fakeDb, alert)).toHaveLength(0);
  });
});
