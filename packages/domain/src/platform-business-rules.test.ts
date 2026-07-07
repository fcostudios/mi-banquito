import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  alert,
  auditLogEntry,
  entityVersion,
  groupConfig,
  organization,
} from "@mi-banquito/db/schema";

import {
  buildDefaultGroupConfigValues,
  businessRuleRowsFromConfig,
} from "./platform";

class FakeSelectBuilder {
  constructor(private readonly nextResult: () => unknown[]) {}

  from() {
    return this;
  }

  where(condition: unknown) {
    this.lastWhere = condition;
    return this;
  }

  orderBy() {
    return this;
  }

  limit() {
    return this;
  }

  private lastWhere: unknown;

  get whereCondition() {
    return this.lastWhere;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.nextResult()).then(onfulfilled, onrejected);
  }
}

class FakeDb {
  readonly selects: FakeSelectBuilder[] = [];
  private readonly selectResults: unknown[][];

  constructor(selectResults: unknown[][] = []) {
    this.selectResults = [...selectResults];
  }

  select() {
    const builder = new FakeSelectBuilder(() => this.selectResults.shift() ?? []);
    this.selects.push(builder);
    return builder;
  }
}

type InsertRecord = {
  tableName: string;
  values: Record<string, unknown> | Array<Record<string, unknown>>;
};

type UpdateRecord = {
  tableName: string;
  values: Record<string, unknown>;
};

const tableNameOf = (table: unknown): string => getTableName(table as Parameters<typeof getTableName>[0]);

class FakeWriteSelectBuilder extends FakeSelectBuilder {}

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

class FakeUpdateBuilder {
  private values?: Record<string, unknown>;

  constructor(
    private readonly table: unknown,
    private readonly updates: UpdateRecord[],
  ) {}

  set(values: Record<string, unknown>) {
    this.values = values;
    this.updates.push({ tableName: tableNameOf(this.table), values });
    return this;
  }

  where() {
    return this;
  }

  returning() {
    return Promise.resolve([{ id: "11111111-1111-4111-8111-111111111111", ...this.values }]);
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve([]).then(onfulfilled, onrejected);
  }
}

class FakeWriteDb {
  readonly inserts: InsertRecord[] = [];
  readonly updates: UpdateRecord[] = [];
  private readonly selectResults: unknown[][];

  constructor(selectResults: unknown[][] = []) {
    this.selectResults = [...selectResults];
  }

  select() {
    return new FakeWriteSelectBuilder(() => this.selectResults.shift() ?? []);
  }

  insert(table: unknown) {
    return new FakeInsertBuilder(table, this.inserts);
  }

  update(table: unknown) {
    return new FakeUpdateBuilder(table, this.updates);
  }

  transaction<T>(callback: (tx: FakeWriteDb) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function insertedRows(fakeDb: FakeWriteDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.inserts
    .filter((entry) => entry.tableName === tableNameOf(table))
    .flatMap((entry) => Array.isArray(entry.values) ? entry.values : [entry.values]);
}

function updatedRows(fakeDb: FakeWriteDb, table: unknown): Array<Record<string, unknown>> {
  return fakeDb.updates
    .filter((entry) => entry.tableName === tableNameOf(table))
    .map((entry) => entry.values);
}

describe("US-024 business-rules projection", () => {
  it("projects current group config as human-readable Spanish rows", () => {
    const config = {
      ...buildDefaultGroupConfigValues({
        orgId: "11111111-1111-4111-8111-111111111111",
        currencyCode: "USD",
        actorId: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-07-01T00:00:00Z"),
      }),
      loanRatePeriodUnit: "monthly",
      yearEndShareOutFormula: "proportional_time_weighted",
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
    };

    expect(businessRuleRowsFromConfig(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: "Aporte regular",
        currentValue: "$20.00 mensual",
        priorValue: "",
        newValue: "$20.00 mensual",
        validFrom: "2026-07-01T00:00:00.000Z",
        validTo: "",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
        lastChangedByKind: "platform_operator",
      }),
      expect.objectContaining({
        rule: "Tasa para socias",
        currentValue: "4.00% mensual",
        newValue: "4.00% mensual",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
        lastChangedByKind: "platform_operator",
      }),
      expect.objectContaining({
        rule: "Tope préstamo / ahorro",
        currentValue: "2.00x el ahorro",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
      }),
      expect.objectContaining({
        rule: "Atraso",
        currentValue: "Después de 3 días",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
      }),
      expect.objectContaining({
        rule: "Mora",
        currentValue: "Después de 15 días",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
      }),
      expect.objectContaining({
        rule: "Comisión administrativa",
        currentValue: "1.00%",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
      }),
      expect.objectContaining({
        rule: "Comisión por referida",
        currentValue: "$5.00",
        lastChangedAt: "2026-07-01T00:00:00.000Z",
        lastChangedBy: "22222222-2222-4222-8222-222222222222",
      }),
    ]));
  });

  it("includes EntityVersion history with prior value, validity window, and actor kind", async () => {
    const olderConfig = buildDefaultGroupConfigValues({
      orgId: "11111111-1111-4111-8111-111111111111",
      currencyCode: "USD",
      actorId: "22222222-2222-4222-8222-222222222222",
      now: new Date("2026-06-01T00:00:00Z"),
    });
    const currentConfig = {
      ...buildDefaultGroupConfigValues({
        orgId: "11111111-1111-4111-8111-111111111111",
        currencyCode: "USD",
        actorId: "33333333-3333-4333-8333-333333333333",
        now: new Date("2026-07-01T00:00:00Z"),
      }),
      contributionAmount: "25.0000",
      version: 2,
    };
    const olderSnapshot = JSON.parse(JSON.stringify(olderConfig));
    const currentSnapshot = JSON.parse(JSON.stringify(currentConfig));
    const fakeDb = new FakeDb([
      [currentConfig],
      [
        {
          version: 2,
          validFrom: new Date("2026-07-01T00:00:00Z"),
          validTo: null,
          payloadSnapshot: currentSnapshot,
          createdAt: new Date("2026-07-01T00:00:00Z"),
          createdBy: "33333333-3333-4333-8333-333333333333",
          createdByKind: "member",
        },
        {
          version: 1,
          validFrom: new Date("2026-06-01T00:00:00Z"),
          validTo: new Date("2026-07-01T00:00:00Z"),
          payloadSnapshot: olderSnapshot,
          createdAt: new Date("2026-06-01T00:00:00Z"),
          createdBy: "22222222-2222-4222-8222-222222222222",
          createdByKind: "platform_operator",
        },
      ],
    ]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createPlatformService } = await import("./platform");
      const rows = await createPlatformService().listBusinessRuleRows("11111111-1111-4111-8111-111111111111");

      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rule: "Aporte regular",
          currentValue: "$25.00 mensual",
          priorValue: "$20.00 mensual",
          newValue: "$25.00 mensual",
          validFrom: "2026-07-01T00:00:00.000Z",
          validTo: "",
          lastChangedBy: "33333333-3333-4333-8333-333333333333",
          lastChangedByKind: "member",
        }),
        expect.objectContaining({
          rule: "Aporte regular",
          currentValue: "$25.00 mensual",
          priorValue: "",
          newValue: "$20.00 mensual",
          validFrom: "2026-06-01T00:00:00.000Z",
          validTo: "2026-07-01T00:00:00.000Z",
          lastChangedByKind: "platform_operator",
        }),
      ]));
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("returns no rows when the org has no current config", async () => {
    const fakeDb = new FakeDb([[]]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createPlatformService } = await import("./platform");
      await expect(createPlatformService().listBusinessRuleRows(
        "11111111-1111-4111-8111-111111111111",
      )).resolves.toEqual([]);
      expect(fakeDb.selects).toHaveLength(1);
      expect(fakeDb.selects[0]?.whereCondition).toBeDefined();
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("records an audit row when business rules are viewed", async () => {
    const entries: unknown[] = [];
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: {} }));

    try {
      const { createPlatformService } = await import("./platform");
      await createPlatformService({
        auditWriter: async ({ entry }) => {
          entries.push(entry);
        },
      }).recordBusinessRulesView(
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      );

      expect(entries).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          actorKind: "platform_operator",
          actorId: "22222222-2222-4222-8222-222222222222",
          actionKind: "business_rules.view",
          subjectKind: "organization",
          subjectId: "11111111-1111-4111-8111-111111111111",
        }),
      ]);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("versions the seeded GroupConfig when a platform org is created", async () => {
    const fakeDb = new FakeWriteDb();
    const auth0 = {
      createOrganization: vi.fn(async () => ({ auth0OrgId: "auth0-org-1" })),
    };
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createPlatformService } = await import("./platform");
      await createPlatformService().createOrganization(
        {
          displayName: "Mi Banquito",
          countryCode: "EC",
          currencyCode: "USD",
          timezone: "America/Guayaquil",
          defaultLanguage: "es",
          brandingLogoUri: "",
        },
        "22222222-2222-4222-8222-222222222222",
        auth0,
      );

      const [configRow] = insertedRows(fakeDb, groupConfig);
      expect(insertedRows(fakeDb, entityVersion)).toEqual([
        expect.objectContaining({
          orgId: "99999999-9999-4999-8999-999999999999",
          entityKind: "GroupConfig",
          entityId: "99999999-9999-4999-8999-999999999999",
          version: 1,
          payloadSnapshot: expect.objectContaining({
            id: "99999999-9999-4999-8999-999999999999",
            contributionAmount: "20.0000",
          }),
          changeKind: "create",
          createdBy: "22222222-2222-4222-8222-222222222222",
          createdByKind: "platform_operator",
        }),
      ]);
      expect(configRow).toEqual(expect.objectContaining({
        orgId: "99999999-9999-4999-8999-999999999999",
        version: 1,
      }));
      expect(insertedRows(fakeDb, auditLogEntry)).toHaveLength(1);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });

  it("closes the prior GroupConfig EntityVersion when a new config version is saved", async () => {
    const previousConfig = {
      ...buildDefaultGroupConfigValues({
        orgId: "11111111-1111-4111-8111-111111111111",
        currencyCode: "USD",
        actorId: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-06-01T00:00:00Z"),
      }),
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const fakeDb = new FakeWriteDb([[previousConfig]]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
    }));

    try {
      const { createPlatformService } = await import("./platform");
      await createPlatformService().saveGroupConfig(
        "11111111-1111-4111-8111-111111111111",
        {
          contributionCycleKind: "monthly",
          contributionAmount: "25",
          memberLoanRateValue: "4",
          nonMemberLoanRateValue: "5",
          loanRateModel: "declining_balance",
          loanRatePeriodUnit: "monthly",
          loanGracePeriods: 0,
          loanToSavingsCapRatio: "2",
          yearEndShareOutFormula: "proportional_time_weighted",
          reconciliationToleranceAmount: "1",
          lateThresholdDays: 3,
          moraThresholdDays: 15,
          fiscalYearStartMonth: 1,
          fiscalYearStartDay: 1,
          baseFundQuotaFiscalYear: 2026,
          baseFundQuotaAmount: "25",
          adminFeePct: "1",
          referralCommissionAmount: "5",
          treasurerCompensationKind: "fixed",
          treasurerCompensationAmount: "10",
          treasurerCompensationPeriod: "monthly",
          opensOnDay: 1,
        },
        "33333333-3333-4333-8333-333333333333",
        "member",
      );

      expect(updatedRows(fakeDb, groupConfig)).toEqual([
        expect.objectContaining({ validTo: expect.any(Date) }),
      ]);
      expect(updatedRows(fakeDb, entityVersion)).toEqual([
        expect.objectContaining({ validTo: expect.any(Date) }),
      ]);
      expect(insertedRows(fakeDb, entityVersion)).toEqual([
        expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          entityKind: "GroupConfig",
          version: 2,
          changeKind: "update",
          createdBy: "33333333-3333-4333-8333-333333333333",
          createdByKind: "member",
        }),
      ]);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("emits A9 when a normalized group config value changes", async () => {
    const previousConfig = {
      ...buildDefaultGroupConfigValues({
        orgId: "11111111-1111-4111-8111-111111111111",
        currencyCode: "USD",
        actorId: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-06-01T00:00:00Z"),
      }),
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const fakeDb = new FakeWriteDb([[previousConfig]]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
    }));

    try {
      const { createPlatformService } = await import("./platform");
      await createPlatformService().saveGroupConfig(
        "11111111-1111-4111-8111-111111111111",
        {
          contributionCycleKind: "monthly",
          contributionAmount: "25",
          memberLoanRateValue: "4",
          nonMemberLoanRateValue: "5",
          loanRateModel: "declining_balance",
          loanRatePeriodUnit: "monthly",
          loanGracePeriods: 0,
          loanToSavingsCapRatio: "2",
          yearEndShareOutFormula: "proportional_time_weighted",
          reconciliationToleranceAmount: "1",
          lateThresholdDays: 3,
          moraThresholdDays: 15,
          fiscalYearStartMonth: 1,
          fiscalYearStartDay: 1,
          baseFundQuotaFiscalYear: 2026,
          baseFundQuotaAmount: "25",
          adminFeePct: "1",
          referralCommissionAmount: "5",
          treasurerCompensationKind: "fixed",
          treasurerCompensationAmount: "10",
          treasurerCompensationPeriod: "monthly",
          opensOnDay: 1,
        },
        "33333333-3333-4333-8333-333333333333",
        "member",
      );

      expect(insertedRows(fakeDb, alert)).toEqual([
        expect.objectContaining({
          alertKind: "A9",
          severity: "low",
          audience: "treasurer",
          subjectKind: "group_config",
          payload: expect.objectContaining({
            changedKeys: ["contribution_amount"],
            actorLabel: "member:33333333-3333-4333-8333-333333333333",
          }),
        }),
      ]);
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual(expect.arrayContaining([
        expect.objectContaining({ actionKind: "alert.group_config_changed.emit" }),
      ]));
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("does not emit A9 for a normalized no-op group config save", async () => {
    const previousConfig = {
      ...buildDefaultGroupConfigValues({
        orgId: "11111111-1111-4111-8111-111111111111",
        currencyCode: "USD",
        actorId: "22222222-2222-4222-8222-222222222222",
        now: new Date("2026-06-01T00:00:00Z"),
      }),
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      contributionAmount: "20.0000",
    };
    const fakeDb = new FakeWriteDb([[previousConfig]]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));
    vi.doMock("@mi-banquito/db/tenant", () => ({
      withTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
      withWritableTenantTransaction: async (_orgId: string, run: (tx: FakeWriteDb) => Promise<unknown>) =>
        fakeDb.transaction(run),
    }));

    try {
      const { createPlatformService } = await import("./platform");
      await createPlatformService().saveGroupConfig(
        "11111111-1111-4111-8111-111111111111",
        {
          contributionCycleKind: "monthly",
          contributionAmount: "20.00",
          memberLoanRateValue: "4.0000",
          nonMemberLoanRateValue: "5.0000",
          loanRateModel: "declining_balance",
          loanRatePeriodUnit: "monthly",
          loanGracePeriods: 0,
          loanToSavingsCapRatio: "2.00",
          yearEndShareOutFormula: "proportional_time_weighted",
          reconciliationToleranceAmount: "1.0000",
          lateThresholdDays: 3,
          moraThresholdDays: 15,
          fiscalYearStartMonth: 1,
          fiscalYearStartDay: 1,
          baseFundQuotaFiscalYear: 2026,
          baseFundQuotaAmount: "25.0000",
          adminFeePct: "1.0000",
          referralCommissionAmount: "5.0000",
          treasurerCompensationKind: "fixed",
          treasurerCompensationAmount: "10.0000",
          treasurerCompensationPeriod: "monthly",
          opensOnDay: 1,
        },
        "33333333-3333-4333-8333-333333333333",
        "member",
      );

      expect(insertedRows(fakeDb, alert)).toHaveLength(0);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.doUnmock("@mi-banquito/db/tenant");
      vi.resetModules();
    }
  });

  it("pauses or archives an organization with a required audit reason", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const fakeDb = new FakeWriteDb([[
      {
        id: orgId,
        displayName: "Mi Banquito",
        status: "active",
      },
    ]]);
    vi.resetModules();
    vi.doMock("@mi-banquito/db", () => ({ db: fakeDb }));

    try {
      const { createPlatformService } = await import("./platform");
      await expect(createPlatformService().updateOrganizationLifecycle({
        orgId,
        actorId: "33333333-3333-4333-8333-333333333333",
        status: "paused",
        reason: "La organización pausó operaciones por decisión de la asamblea.",
      })).resolves.toEqual(expect.objectContaining({ status: "paused" }));

      expect(updatedRows(fakeDb, organization)).toEqual([
        expect.objectContaining({ status: "paused", updatedBy: "33333333-3333-4333-8333-333333333333" }),
      ]);
      expect(insertedRows(fakeDb, auditLogEntry)).toEqual([
        expect.objectContaining({
          actionKind: "organization.lifecycle",
          reason: "La organización pausó operaciones por decisión de la asamblea.",
          payloadSnapshot: expect.objectContaining({ priorStatus: "active", newStatus: "paused" }),
        }),
      ]);
    } finally {
      vi.doUnmock("@mi-banquito/db");
      vi.resetModules();
    }
  });
});
