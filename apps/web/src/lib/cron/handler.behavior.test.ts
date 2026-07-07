import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alert } from "@mi-banquito/db/schema";

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

  onConflictDoNothing() {
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
    return this;
  }
}

class FakeCronDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: UpdateRecord[] = [];
  readonly executedQueries: unknown[] = [];
  private readonly selectResults: unknown[][];
  private readonly executeResults: unknown[][];

  constructor(args: { selectResults: unknown[][]; executeResults?: unknown[][] }) {
    this.selectResults = [...args.selectResults];
    this.executeResults = [...(args.executeResults ?? [])];
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

  execute(query: unknown) {
    this.executedQueries.push(query);
    return Promise.resolve({ rows: this.executeResults.shift() ?? [] });
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
      executeResults: [[{
        borrower_kind: "non_member",
        borrower_name: "Ana externa",
        guarantor_name: "Pancho",
        days_late: 30,
      }]],
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
});
