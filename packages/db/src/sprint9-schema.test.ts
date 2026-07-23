import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

config({ path: "../../.env.local" });
config({ path: "../../apps/web/.env.local" });
if (!process.env.DATABASE_URL) {
  const worktreeOwnerEnv = new URL("../../../../../packages/db/.env.local", import.meta.url);
  if (existsSync(worktreeOwnerEnv)) {
    config({ path: worktreeOwnerEnv });
    if (process.env.DATABASE_URL) {
      const isolatedUrl = new URL(process.env.DATABASE_URL);
      isolatedUrl.pathname = "/mi_banquito_sprint9_task5_bindings";
      process.env.DATABASE_URL = isolatedUrl.toString();
    }
  }
}

const migrationUrl = new URL(
  "./migrations/V20260721130000__extraordinary_collection_lifecycle.sql",
  import.meta.url,
);
const preflightMigrationUrl = new URL(
  "./migrations/V20260721125900__extraordinary_collection_upgrade_preflight.sql",
  import.meta.url,
);
const guardFixMigrationUrl = new URL(
  "./migrations/V20260721133000__extraordinary_collection_guard_fixes.sql",
  import.meta.url,
);
const financialBindingMigrationUrl = new URL(
  "./migrations/V20260721133500__extraordinary_collection_financial_bindings.sql",
  import.meta.url,
);
const tenantFiniteMigrationUrl = new URL(
  "./migrations/V20260721134000__collection_tenant_finite_money.sql",
  import.meta.url,
);
const lineOpenGuardMigrationUrl = new URL(
  "./migrations/V20260721135000__collection_line_open_guard.sql",
  import.meta.url,
);
const regularizationReversalMigrationUrl = new URL(
  "./migrations/V20260721135500__collection_regularization_reversal_guards.sql",
  import.meta.url,
);
const regularizationLiveSourceMigrationUrl = new URL(
  "./migrations/V20260721135600__regularization_live_source_guards.sql",
  import.meta.url,
);
const payoutCorrectionMigrationUrl = new URL(
  "./migrations/V20260721135700__collection_payout_replay_correction.sql",
  import.meta.url,
);
const payoutAccountRequiredMigrationUrl = new URL(
  "./migrations/V20260721135800__collection_payout_account_required.sql",
  import.meta.url,
);
const activeTreasurerUniquenessMigrationUrl = new URL(
  "./migrations/V20260721135900__unique_active_treasurer.sql",
  import.meta.url,
);
const balanceProjectionMigrationUrl = new URL(
  "./migrations/V20260721140000__sprint9_balance_projections.sql",
  import.meta.url,
);
const reversalBindingGuardMigrationUrl = new URL(
  "./migrations/V20260721140100__ledger_reversal_and_collection_binding_guards.sql",
  import.meta.url,
);
const retainedReclassificationMigrationUrl = new URL(
  "./migrations/V20260721140200__retained_collection_reclassification.sql",
  import.meta.url,
);
const retainedPayoutDateBindingMigrationUrl = new URL(
  "./migrations/V20260721140300__retained_payout_effective_date_binding.sql",
  import.meta.url,
);
const terminalChronologyMigrationUrl = new URL(
  "./migrations/V20260721140400__collection_terminal_chronology_and_audit_index.sql",
  import.meta.url,
);
const retainedClientFenceMigrationUrl = new URL(
  "./migrations/V20260721140500__retained_client_request_uniqueness_fence.sql",
  import.meta.url,
);
const retainedAllCommandFenceMigrationUrl = new URL(
  "./migrations/V20260721140600__retained_all_command_client_fence.sql",
  import.meta.url,
);
const runIfDatabase = process.env.DATABASE_URL ? it : it.skip;

type CollectionSchema = typeof schema & {
  extraordinary_collection_disposition_enum?: {
    enumValues: string[];
  };
};

const collectionSchema = schema as CollectionSchema;

const expectRejected = async (
  client: pg.PoolClient,
  query: string,
  values: unknown[] = [],
  expected: { code?: string | string[]; message?: string } = { code: ["23514", "55000"] },
) => {
  const savepoint = `sp_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    let rejection: unknown;
    try {
      await client.query(query, values);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeDefined();
    if (expected.code) {
      const allowedCodes = Array.isArray(expected.code) ? expected.code : [expected.code];
      expect(allowedCodes).toContain((rejection as { code?: string }).code);
    }
    if (expected.message) expect(rejection).toMatchObject({ message: expect.stringContaining(expected.message) });
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  }
};

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

const seedFixture = async (client: pg.PoolClient) => {
  const ids = {
    orgId: randomUUID(),
    otherOrgId: randomUUID(),
    actorId: randomUUID(),
    memberId: randomUUID(),
    otherMemberId: randomUUID(),
    groupAccountId: randomUUID(),
    secondGroupAccountId: randomUUID(),
    personalAccountId: randomUUID(),
    secondPersonalAccountId: randomUUID(),
    inactivePersonalAccountId: randomUUID(),
    inactiveGroupAccountId: randomUUID(),
    otherPersonalAccountId: randomUUID(),
    otherGroupAccountId: randomUUID(),
    paidExpenseId: randomUUID(),
    plannedExpenseId: randomUUID(),
    wrongKindExpenseId: randomUUID(),
    otherOrgExpenseId: randomUUID(),
  };
  await client.query(`
    INSERT INTO organization (
      id, display_name, country_code, currency_code, timezone, default_language,
      status, created_at, created_by, created_by_kind
    ) VALUES
      ($1, 'CHG-011 fixture', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system'),
      ($2, 'CHG-011 other tenant', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), $3, 'system')
  `, [ids.orgId, ids.otherOrgId, ids.actorId]);
  await client.query(`
    INSERT INTO member (
      id, org_id, display_name, joined_on, role, status, initial_savings_balance,
      created_at, created_by, created_by_kind
    ) VALUES
      ($1, $3, 'Fixture member', '2026-01-01', 'aportante', 'activo', 0, now(), $4, 'member'),
      ($2, $3, 'Other member', '2026-01-01', 'aportante', 'activo', 0, now(), $4, 'member')
  `, [ids.memberId, ids.otherMemberId, ids.orgId, ids.actorId]);
  await client.query(`
    INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
    VALUES
      ($1, $9, 'Group', 'group_bank', true, 'active', now(), $11),
      ($2, $9, 'Second group', 'cash_box', true, 'active', now(), $11),
      ($3, $9, 'Personal', 'treasurer_personal', false, 'active', now(), $11),
      ($4, $9, 'Second personal', 'external', false, 'active', now(), $11),
      ($5, $9, 'Inactive personal', 'treasurer_personal', false, 'archived', now(), $11),
      ($6, $9, 'Inactive group', 'group_bank', true, 'archived', now(), $11),
      ($7, $10, 'Other personal', 'treasurer_personal', false, 'active', now(), $11),
      ($8, $10, 'Other group', 'group_bank', true, 'active', now(), $11)
  `, [
    ids.groupAccountId,
    ids.secondGroupAccountId,
    ids.personalAccountId,
    ids.secondPersonalAccountId,
    ids.inactivePersonalAccountId,
    ids.inactiveGroupAccountId,
    ids.otherPersonalAccountId,
    ids.otherGroupAccountId,
    ids.orgId,
    ids.otherOrgId,
    ids.actorId,
  ]);
  await client.query(`
    INSERT INTO expense (
      id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on, status, recorded_at,
      account_id, category, created_at, created_by, created_by_kind
    ) VALUES
      ($1, $5, 'Paid solidarity', 4, 'USD', $10, '2026-07-22', 'paid', now(), $6, 'solidarity_payout', now(), $7, 'member'),
      ($2, $5, 'Planned solidarity', 4, 'USD', $10, '2026-07-22', 'planned', now(), $6, 'solidarity_payout', now(), $7, 'member'),
      ($3, $5, 'Wrong kind', 4, 'USD', $10, '2026-07-22', 'paid', now(), $6, 'supplies', now(), $7, 'member'),
      ($4, $8, 'Other tenant', 4, 'USD', NULL, '2026-07-22', 'paid', now(), $9, 'solidarity_payout', now(), $7, 'member')
  `, [
    ids.paidExpenseId,
    ids.plannedExpenseId,
    ids.wrongKindExpenseId,
    ids.otherOrgExpenseId,
    ids.orgId,
    ids.groupAccountId,
    ids.actorId,
    ids.otherOrgId,
    ids.otherGroupAccountId,
    ids.memberId,
  ]);
  return ids;
};

const insertCollection = async (
  client: pg.PoolClient,
  fixture: Fixture,
  options: {
    id?: string;
    kind?: "solidarity" | "treasurer_recognition";
    status?: "open" | "collecting";
    paidOutExpenseId?: string | null;
  } = {},
) => {
  const id = options.id ?? randomUUID();
  const kind = options.kind ?? "solidarity";
  await client.query(`
    INSERT INTO extraordinary_collection (
      id, org_id, kind, purpose, beneficiary_member_id, status, opened_on,
      paid_out_expense_id, recognition_fiscal_year, created_at, created_by
    ) VALUES ($1, $2, $3, 'Fixture collection', $4, $5, '2026-07-21', $6, $7, now(), $8)
  `, [
    id,
    fixture.orgId,
    kind,
    fixture.memberId,
    options.status ?? "open",
    options.paidOutExpenseId ?? null,
    kind === "treasurer_recognition" ? 2026 : null,
    fixture.actorId,
  ]);
  return id;
};

const insertLine = async (
  client: pg.PoolClient,
  fixture: Fixture,
  collectionId: string,
  options: {
    id?: string;
    amount?: number;
    accountId?: string;
    status?: "pending" | "regularized";
    reversesId?: string | null;
    reverseReason?: string | null;
    datedOn?: string;
  } = {},
) => {
  const id = options.id ?? randomUUID();
  await client.query(`
    INSERT INTO extraordinary_collection_line (
      id, org_id, collection_id, member_id, amount, account_id, reconciliation_status,
      dated_on, reverses_id, reverse_reason, created_at, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11)
  `, [
    id,
    fixture.orgId,
    collectionId,
    fixture.memberId,
    options.amount ?? 10,
    options.accountId ?? fixture.groupAccountId,
    options.status ?? "regularized",
    options.datedOn ?? "2026-07-21",
    options.reversesId ?? null,
    options.reverseReason ?? null,
    fixture.actorId,
  ]);
  return id;
};

describe("CHG-011 extraordinary collection schema", () => {
  it("requires a real PostgreSQL database for the focused lifecycle gate", () => {
    expect(process.env.DATABASE_URL, "DATABASE_URL or the repo-local DB environment is required")
      .toBeTruthy();
  });

  it("preserves the exact Drizzle column and index contract", () => {
    expect(collectionSchema.extraordinary_collection_disposition_enum?.enumValues).toEqual([
      "returned",
      "retained",
    ]);
    expect(schema.extraordinaryCollection).toMatchObject({
      surplusAmount: { name: "surplus_amount" },
      disposition: { name: "disposition" },
      dispositionMotive: { name: "disposition_motive" },
      surplusTransferId: { name: "surplus_transfer_id" },
      recognitionFiscalYear: { name: "recognition_fiscal_year" },
    });
    expect(schema.extraordinaryCollectionLine).toMatchObject({
      accountId: { name: "account_id", notNull: true },
      reversesId: { name: "reverses_id" },
      reverseReason: { name: "reverse_reason" },
    });

    expect(getTableConfig(schema.extraordinaryCollection).indexes.map((entry) => ({
      name: entry.config.name,
      partial: entry.config.where !== undefined,
      unique: entry.config.unique,
    }))).toEqual(expect.arrayContaining([
      { name: "idx_extraordinary_collection_org_status_opened", partial: false, unique: false },
      { name: "idx_extraordinary_collection_org_recognition_year", partial: true, unique: false },
    ]));
    expect(getTableConfig(schema.auditLogEntry).indexes.map((entry) => ({
      name: entry.config.name,
      partial: entry.config.where !== undefined,
      unique: entry.config.unique,
    }))).toContainEqual({ name: "idx_audit_collection_terminal_lookup", partial: true, unique: false });
    expect(getTableConfig(schema.extraordinaryCollectionLine).indexes.map((entry) => ({
      name: entry.config.name,
      partial: entry.config.where !== undefined,
      unique: entry.config.unique,
    }))).toEqual(expect.arrayContaining([
      { name: "idx_extraordinary_collection_line_org_collection_date", partial: false, unique: false },
      { name: "idx_collection_line_pending_page", partial: true, unique: false },
      { name: "uq_extraordinary_collection_line_reverses", partial: true, unique: true },
      { name: "uq_extraordinary_collection_line_org_reverses", partial: true, unique: true },
    ]));
    expect(getTableConfig(schema.extraordinaryCollection).checks.map((entry) => entry.name))
      .toEqual(expect.arrayContaining([
        "ck_extraordinary_collection_kind",
        "ck_extraordinary_collection_status",
        "ck_extraordinary_collection_target_nonnegative",
        "ck_extraordinary_collection_recognition_year",
        "ck_extraordinary_collection_disposition",
        "ck_extraordinary_collection_status_expense",
      ]));
    expect(getTableConfig(schema.extraordinaryCollectionLine).checks.map((entry) => entry.name))
      .toEqual(expect.arrayContaining([
        "ck_extraordinary_collection_line_amount_nonnegative",
        "ck_extraordinary_collection_line_zero_regularized",
        "ck_extraordinary_collection_line_reversal_pair",
      ]));
    expect(getTableConfig(schema.extraordinaryCollectionLine).foreignKeys.map((entry) => entry.getName()))
      .toEqual(expect.arrayContaining([
        "fk_extraordinary_collection_line_org_collection",
        "fk_extraordinary_collection_line_reversal_binding",
      ]));
    expect(getTableConfig(schema.extraordinaryCollectionLine).uniqueConstraints.map((entry) => entry.name))
      .toContain("uq_extraordinary_collection_line_reversal_target");
    expect(getTableConfig(schema.extraordinaryCollection).foreignKeys.map((entry) => entry.getName()))
      .toEqual(expect.arrayContaining([
        "fk_extraordinary_collection_beneficiary_org",
        "fk_extraordinary_collection_paid_out_expense_org",
        "fk_extraordinary_collection_surplus_transfer_org",
      ]));
    expect(getTableConfig(schema.extraordinaryCollection).uniqueConstraints.map((entry) => entry.name))
      .toContain("uq_extraordinary_collection_org_id_id");
    expect(getTableConfig(schema.transfer).checks.map((entry) => entry.name))
      .toContain("ck_transfer_regularization_amount_positive");
    expect(getTableConfig(schema.transfer).indexes.map((entry) => ({
      name: entry.config.name,
      partial: entry.config.where !== undefined,
      unique: entry.config.unique,
    }))).toEqual(expect.arrayContaining([
      { name: "idx_transfer_live_regularization_coverage", partial: true, unique: false },
    ]));
    expect(getTableConfig(schema.extraordinaryCollectionLine).foreignKeys.map((entry) => entry.getName()))
      .toEqual(expect.arrayContaining([
        "fk_extraordinary_collection_line_member_org",
        "fk_extraordinary_collection_line_account_org",
      ]));
    expect(getTableConfig(schema.expense).foreignKeys.map((entry) => entry.getName()))
      .toContain("fk_expense_beneficiary_org");
    expect(getTableConfig(schema.member).indexes.map((entry) => ({
      name: entry.config.name,
      partial: entry.config.where !== undefined,
      unique: entry.config.unique,
    }))).toContainEqual({
      name: "uq_member_org_single_active_treasurer",
      partial: true,
      unique: true,
    });
    expect(getTableConfig(schema.contribution).indexes.map((entry) => entry.config.name))
      .toContain("uq_contribution_reverses_once");
    expect(getTableConfig(schema.repayment).indexes.map((entry) => entry.config.name))
      .toContain("uq_repayment_reverses_once");
    expect(getTableConfig(schema.withdrawal).indexes.map((entry) => entry.config.name))
      .toContain("uq_withdrawal_reverses_once");
    expect(getTableConfig(schema.expense).indexes.map((entry) => entry.config.name))
      .toContain("uq_expense_reverses_once");
    expect(getTableConfig(schema.transfer).indexes.map((entry) => entry.config.name))
      .toContain("uq_transfer_reverses_once");
    expect(getTableConfig(schema.extraordinaryCollection).indexes.map((entry) => entry.config.name))
      .toEqual(expect.arrayContaining([
        "uq_collection_paid_out_expense_once",
        "uq_collection_surplus_transfer_once",
      ]));
  });

  it("ships one additive migration with the lifecycle, check, and lock contracts", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const migration = readFileSync(migrationUrl, "utf8");
    expect(migration).toContain("allow_extraordinary_collection_transition");
    expect(migration).toContain("allow_extraordinary_collection_line_regularization");
    expect(migration).toContain("validate_regularization_transfer");
    expect(migration).toContain("recognition_fiscal_year IS DISTINCT FROM OLD.recognition_fiscal_year");
    expect(migration).toContain("regularizes_kind = 'extraordinary_collection'");
    expect(migration.match(/aa_tenant_money_lock/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("ships an additive NULL-safe guard repair without mutating the lifecycle migration", () => {
    expect(existsSync(guardFixMigrationUrl)).toBe(true);
    const migration = readFileSync(guardFixMigrationUrl, "utf8");
    expect(migration).toContain("ck_extraordinary_collection_status_expense");
    expect(migration.match(/IS TRUE/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("NEW.status = 'cancelled' AND NEW.paid_out_expense_id IS NOT NULL");
  });

  it("ships ordered upgrade preflight and financial-reference binding migrations", () => {
    expect(existsSync(preflightMigrationUrl)).toBe(true);
    expect(existsSync(financialBindingMigrationUrl)).toBe(true);
    const preflight = readFileSync(preflightMigrationUrl, "utf8");
    const binding = readFileSync(financialBindingMigrationUrl, "utf8");
    expect(preflight).toContain("collection_upgrade_recognition_year_required");
    expect(preflight).toContain("collection_upgrade_status_expense_shape_invalid");
    expect(binding).toContain("SET search_path = pg_catalog, public");
    expect(binding).toContain("collection_surplus_return");
    expect(binding).toContain("collection_line_reversal_mismatch");
    expect(binding).toContain("collection_payout_expense_reversal_forbidden");
  });

  it("ships an additive payout holding and governed reversal correction", () => {
    expect(existsSync(payoutCorrectionMigrationUrl)).toBe(true);
    const migration = readFileSync(payoutCorrectionMigrationUrl, "utf8");
    expect(migration).toContain("validate_collection_payout_holding");
    expect(migration).toContain("collection_payout_holding_insufficient");
    expect(migration).toContain("protect_collection_payout_expense_reversal");
    expect(migration).toContain("collection_payout_reversal_mismatch");
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });

  it("pins the additive regularized, physical, and earmarked balance functions", () => {
    expect(existsSync(balanceProjectionMigrationUrl)).toBe(true);
    const migration = readFileSync(balanceProjectionMigrationUrl, "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION fund_pool_balance");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION physical_cash_balance");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION collection_cash_balance");
    expect(migration).toContain("COALESCE(original.category, e.category) <> 'solidarity_payout'");
    expect(migration).toContain("t.purpose IS DISTINCT FROM 'collection_surplus_return'");
    expect(migration).toContain("collection.paid_out_expense_id = COALESCE(payout.reverses_id, payout.id)");
    expect(migration).toContain("validate_core_ledger_reversal");
    expect(migration).toContain("validate_transfer_reversal_integrity");
  });

  it("pins the immutable additive reversal and collection-binding repair", () => {
    expect(existsSync(reversalBindingGuardMigrationUrl)).toBe(true);
    const migration = readFileSync(reversalBindingGuardMigrationUrl, "utf8");
    expect(migration).toContain("sprint9_reversal_preflight_duplicate");
    expect(migration).toContain("sprint9_reversal_preflight_mismatch");
    expect(migration).toContain("sprint9_collection_binding_preflight_duplicate");
    expect(migration.match(/CREATE UNIQUE INDEX uq_.*_reverses_once/g)).toHaveLength(5);
    expect(migration).toContain("CREATE UNIQUE INDEX uq_collection_paid_out_expense_once");
    expect(migration).toContain("CREATE UNIQUE INDEX uq_collection_surplus_transfer_once");
    for (const kind of ["contribution", "repayment", "withdrawal", "expense", "transfer"]) {
      expect(migration).toContain(`validate_${kind}_reversal_exact`);
      expect(migration).toContain(`${kind}_reversal_mismatch`);
    }
  });

  it("ships retained-surplus reclassification as a dated fail-closed projection", () => {
    expect(existsSync(retainedReclassificationMigrationUrl)).toBe(true);
    const migration = readFileSync(retainedReclassificationMigrationUrl, "utf8");
    expect(migration).toContain("retained_collection_reclassification");
    expect(migration).toContain("safe_collection_command_date");
    expect(migration).toContain("safe_collection_positive_amount");
    expect(migration).toContain("event.terminal_event_count = 1");
    expect(migration).toContain("event.payload->>'command' = 'cancel'");
    expect(migration).toContain("event.payload->>'command' = 'payout'");
    expect(migration).toContain("header.kind = 'solidarity'");
    expect(migration).toContain("header.disposition = 'retained'");
    expect(migration).toContain("header.surplus_amount > 0");
    expect(migration).toContain("header.surplus_transfer_id IS NULL");
    expect(migration).toContain("event.reason IS NULL");
    expect(existsSync(retainedPayoutDateBindingMigrationUrl)).toBe(true);
    const dateBinding = readFileSync(retainedPayoutDateBindingMigrationUrl, "utf8");
    expect(dateBinding).toContain("CREATE OR REPLACE FUNCTION retained_collection_reclassification");
    expect(dateBinding).toContain("event.effective_on = payout.incurred_on");
    expect(existsSync(terminalChronologyMigrationUrl)).toBe(true);
    const chronology = readFileSync(terminalChronologyMigrationUrl, "utf8");
    expect(chronology).toContain("CREATE INDEX idx_audit_collection_terminal_lookup");
    expect(chronology).toContain("event.effective_on >= header.opened_on");
    expect(chronology).toContain("line.dated_on > event.effective_on");
    expect(chronology).not.toContain("FROM audit_log_entry duplicate");
    expect(existsSync(retainedClientFenceMigrationUrl)).toBe(true);
    const clientFence = readFileSync(retainedClientFenceMigrationUrl, "utf8");
    expect(clientFence).toContain("PARTITION BY a.org_id, a.payload_snapshot->>'clientRequestId'");
    expect(clientFence).toContain("event.client_request_event_count = 1");
    expect(clientFence).not.toContain("FROM audit_log_entry duplicate");
    expect(existsSync(retainedAllCommandFenceMigrationUrl)).toBe(true);
    const allCommandFence = readFileSync(retainedAllCommandFenceMigrationUrl, "utf8");
    expect(allCommandFence).toContain("WITH all_command_audits AS MATERIALIZED");
    expect(allCommandFence).toContain("FROM all_command_audits command");
    expect(allCommandFence).toContain("command.payload->>'command' IN ('cancel', 'payout')");
    expect(allCommandFence).not.toContain("FROM audit_log_entry duplicate");
  });

  runIfDatabase("installs the partial terminal-audit lookup index", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      const result = await client.query(`SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_audit_collection_terminal_lookup'`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.indexdef).toContain("(org_id, subject_id, id)");
      expect(result.rows[0]?.indexdef).toContain("action_kind = 'collection.command.completed'");
      expect(result.rows[0]?.indexdef).toContain("subject_kind = 'extraordinary_collection'");
      await client.query("SET enable_seqscan = off");
      const explained = await client.query(`EXPLAIN (COSTS OFF)
        SELECT org_id, subject_id, payload_snapshot FROM audit_log_entry
        WHERE org_id = $1 AND action_kind = 'collection.command.completed'
          AND subject_kind = 'extraordinary_collection'`, [randomUUID()]);
      expect(explained.rows.map((row) => row["QUERY PLAN"]).join("\n"))
        .toContain("idx_audit_collection_terminal_lookup");
    } finally {
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("reclassifies a retained surplus on the exact command date without changing physical cash", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId, { amount: 10 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 10, disposition = 'retained',
          disposition_motive = 'Assembly retained surplus'
        WHERE id = $1`, [collectionId]);
      const clientRequestId = randomUUID();
      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        collectionId,
        JSON.stringify({
          command: "cancel",
          clientRequestId,
          collectionId,
          actorId: fixture.actorId,
          datedOn: "2026-07-25",
          disposition: "retained",
          dispositionMotive: "Assembly retained surplus",
          returnAccountId: null,
        }),
      ]);

      const balances = await client.query(`
        SELECT to_char(through_date, 'YYYY-MM-DD') AS through_date,
          fund_pool_balance($1, through_date) AS core,
          collection_cash_balance($1, through_date) AS collection,
          physical_cash_balance($1, through_date) AS physical
        FROM (VALUES ('2026-07-24'::date), ('2026-07-25'::date), ('2026-07-31'::date)) dates(through_date)
        ORDER BY through_date
      `, [fixture.orgId]);
      expect(balances.rows).toEqual([
        { through_date: "2026-07-24", core: "-4.0000", collection: "10.0000", physical: "6.0000" },
        { through_date: "2026-07-25", core: "6.0000", collection: "0.0000", physical: "6.0000" },
        { through_date: "2026-07-31", core: "6.0000", collection: "0.0000", physical: "6.0000" },
      ]);
      const isolated = await client.query(`SELECT retained_collection_reclassification($1, NULL) AS amount`, [fixture.otherOrgId]);
      expect(isolated.rows).toEqual([{ amount: "0.0000" }]);
      const auditCount = await client.query(`SELECT count(*)::integer AS count FROM audit_log_entry
        WHERE org_id = $1 AND action_kind = 'collection.command.completed'
          AND payload_snapshot->>'clientRequestId' = $2`, [fixture.orgId, clientRequestId]);
      expect(auditCount.rows).toEqual([{ count: 1 }]);

      const missingAuditId = await insertCollection(client, fixture);
      await insertLine(client, fixture, missingAuditId, { amount: 4 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [missingAuditId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 4, disposition = 'retained',
          disposition_motive = 'Missing completion audit'
        WHERE id = $1`, [missingAuditId]);
      const beforeMalformed = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(beforeMalformed.rows).toEqual([{ amount: "10.0000" }]);

      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        missingAuditId,
        JSON.stringify({
          command: "cancel",
          clientRequestId: randomUUID(),
          collectionId: missingAuditId,
          actorId: fixture.actorId,
          datedOn: "2026-07-26",
          disposition: "retained",
          dispositionMotive: "Missing completion audit",
          returnAccountId: null,
          unexpected: true,
        }),
      ]);
      const malformed = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(malformed.rows).toEqual([{ amount: "10.0000" }]);

      const recognitionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      await insertLine(client, fixture, recognitionId, { amount: 3 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [recognitionId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 3, disposition = 'retained',
          disposition_motive = 'Recognition remains earmarked'
        WHERE id = $1`, [recognitionId]);
      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        recognitionId,
        JSON.stringify({
          command: "cancel",
          clientRequestId: randomUUID(),
          collectionId: recognitionId,
          actorId: fixture.actorId,
          datedOn: "2026-07-27",
          disposition: "retained",
          dispositionMotive: "Recognition remains earmarked",
          returnAccountId: null,
        }),
      ]);
      const recognition = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(recognition.rows).toEqual([{ amount: "10.0000" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("fails closed for forged payout and cancellation chronology", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId, { amount: 10, datedOn: "2026-07-23" });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1`,
      [collectionId, fixture.paidExpenseId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 6, disposition = 'retained',
          disposition_motive = 'Assembly retained payout surplus'
        WHERE id = $1`, [collectionId]);
      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        collectionId,
        JSON.stringify({
          command: "payout",
          clientRequestId: randomUUID(),
          collectionId,
          actorId: fixture.actorId,
          sourceAccountId: fixture.groupAccountId,
          payoutAmount: "4.0000",
          datedOn: "2026-07-22",
          disposition: "retained",
          dispositionMotive: "Assembly retained payout surplus",
          returnAccountId: null,
        }),
      ]);

      const cancelledId = await insertCollection(client, fixture);
      await insertLine(client, fixture, cancelledId, { amount: 5, datedOn: "2026-07-25" });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [cancelledId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 5, disposition = 'retained',
          disposition_motive = 'Forged cancellation chronology'
        WHERE id = $1`, [cancelledId]);
      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        cancelledId,
        JSON.stringify({
          command: "cancel",
          clientRequestId: randomUUID(),
          collectionId: cancelledId,
          actorId: fixture.actorId,
          datedOn: "2026-07-24",
          disposition: "retained",
          dispositionMotive: "Forged cancellation chronology",
          returnAccountId: null,
        }),
      ]);

      const result = await client.query(`SELECT
        retained_collection_reclassification($1, NULL) AS reclassified,
        fund_pool_balance($1, '2026-07-31') AS core,
        collection_cash_balance($1, '2026-07-31') AS collection,
        physical_cash_balance($1, '2026-07-31') AS physical`, [fixture.orgId]);
      expect(result.rows).toEqual([{
        reclassified: "0.0000", core: "-4.0000", collection: "11.0000", physical: "7.0000",
      }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("fails closed on an org-wide duplicate terminal client request in one audit scan", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const insertRetainedCancellation = async (clientRequestId: string, amount: number, motive: string) => {
        const collectionId = await insertCollection(client, fixture);
        await insertLine(client, fixture, collectionId, { amount, datedOn: "2026-07-21" });
        await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
        await client.query(`UPDATE extraordinary_collection
          SET status = 'cancelled', surplus_amount = $2, disposition = 'retained',
            disposition_motive = $3 WHERE id = $1`, [collectionId, amount, motive]);
        await client.query(`INSERT INTO audit_log_entry (
          org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
          payload_snapshot, reason, at, created_at
        ) VALUES ($1, 'member', $2, 'collection.command.completed',
          'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
          fixture.orgId,
          fixture.actorId,
          collectionId,
          JSON.stringify({
            command: "cancel",
            clientRequestId,
            collectionId,
            actorId: fixture.actorId,
            datedOn: "2026-07-25",
            disposition: "retained",
            dispositionMotive: motive,
            returnAccountId: null,
          }),
        ]);
        return collectionId;
      };

      const reusedClientRequestId = randomUUID();
      await insertRetainedCancellation(reusedClientRequestId, 4, "First duplicate client vote");
      await insertRetainedCancellation(reusedClientRequestId, 5, "Second duplicate client vote");
      const duplicated = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(duplicated.rows).toEqual([{ amount: "0.0000" }]);

      const closeCollisionId = randomUUID();
      const retainedCancelId = await insertRetainedCancellation(
        closeCollisionId, 2, "Recognition collision cancel vote",
      );
      const recognitionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      await insertLine(client, fixture, recognitionId, { amount: 2, datedOn: "2026-07-21" });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [recognitionId]);
      await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [recognitionId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 2, disposition = 'retained',
          disposition_motive = 'Recognition collision close vote' WHERE id = $1`, [recognitionId]);
      await client.query(`INSERT INTO audit_log_entry (
        org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
        payload_snapshot, reason, at, created_at
      ) VALUES ($1, 'member', $2, 'collection.command.completed',
        'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
        fixture.orgId,
        fixture.actorId,
        recognitionId,
        JSON.stringify({
          command: "close_recognition",
          clientRequestId: closeCollisionId,
          collectionId: recognitionId,
          actorId: fixture.actorId,
          dispositionMotive: "Recognition collision close vote",
        }),
      ]);

      const payoutCollectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, payoutCollectionId, { amount: 10, datedOn: "2026-07-21" });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [payoutCollectionId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1`,
      [payoutCollectionId, fixture.paidExpenseId]);
      await client.query(`UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 6, disposition = 'retained',
          disposition_motive = 'Reverse collision payout vote' WHERE id = $1`, [payoutCollectionId]);
      const reverseCollisionId = randomUUID();
      await client.query(`INSERT INTO expense (
        org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
        status, recorded_at, reverses_id, reverse_reason, account_id, category,
        client_request_id, created_at, created_by, created_by_kind
      ) VALUES ($1, 'reversal: pago solidario', 4, 'USD', $2, '2026-07-23',
        'paid', now(), $3, 'Governed payout correction', $4, 'solidarity_payout',
        $5, now(), $6, 'member')`, [
        fixture.orgId, fixture.memberId, fixture.paidExpenseId, fixture.groupAccountId,
        reverseCollisionId, fixture.actorId,
      ]);
      for (const payload of [
        {
          command: "payout", clientRequestId: reverseCollisionId,
          collectionId: payoutCollectionId, actorId: fixture.actorId,
          sourceAccountId: fixture.groupAccountId, payoutAmount: "4.0000", datedOn: "2026-07-22",
          disposition: "retained", dispositionMotive: "Reverse collision payout vote", returnAccountId: null,
        },
        {
          command: "reverse_payout", clientRequestId: reverseCollisionId,
          collectionId: payoutCollectionId, actorId: fixture.actorId,
          reason: "Governed payout correction", datedOn: "2026-07-23",
        },
      ]) {
        await client.query(`INSERT INTO audit_log_entry (
          org_id, actor_kind, actor_id, action_kind, subject_kind, subject_id,
          payload_snapshot, reason, at, created_at
        ) VALUES ($1, 'member', $2, 'collection.command.completed',
          'extraordinary_collection', $3, $4::jsonb, NULL, now(), now())`, [
          fixture.orgId, fixture.actorId, payoutCollectionId, JSON.stringify(payload),
        ]);
      }
      const crossCommandCollisions = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(crossCommandCollisions.rows).toEqual([{ amount: "0.0000" }]);

      await insertRetainedCancellation(randomUUID(), 3, "Distinct client vote");
      const distinct = await client.query(
        "SELECT retained_collection_reclassification($1, NULL) AS amount",
        [fixture.orgId],
      );
      expect(distinct.rows).toEqual([{ amount: "3.0000" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("computes core, collection, and physical balances from the fresh migrated schema", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId, { amount: 10 });
      const result = await client.query(`
        SELECT fund_pool_balance($1, '2026-07-31') AS core,
          collection_cash_balance($1, '2026-07-31') AS collection,
          physical_cash_balance($1, '2026-07-31') AS physical
      `, [fixture.orgId]);
      expect(result.rows).toEqual([{ core: "-4.0000", collection: "10.0000", physical: "6.0000" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects every table-specific reversal mismatch and duplicate collection binding at Layer 1", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const cycleId = randomUUID();
      const loanId = randomUUID();
      const contributionId = randomUUID();
      const repaymentId = randomUUID();
      const withdrawalId = randomUUID();
      const transferId = randomUUID();
      await client.query(`INSERT INTO contribution_cycle (
        id, org_id, cycle_label, kind, opens_on, closes_on, expected_amount_per_member,
        currency_code, status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, '2026-07', 'monthly', '2026-07-01', '2026-07-31', 10,
        'USD', 'open', now(), $3, 'member')`, [cycleId, fixture.orgId, fixture.actorId]);
      await client.query(`INSERT INTO loan (
        id, org_id, member_id, borrower_kind, borrower_member_id, principal_amount, currency_code,
        rate_value, rate_model, term_periods, grace_periods, originated_on, status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, 'member', $3, 10, 'USD', 1, 'declining_balance', 1, 0,
        '2026-07-01', 'originated', now(), $4, 'member')`, [loanId, fixture.orgId, fixture.memberId, fixture.actorId]);
      await client.query(`INSERT INTO contribution (
        id, org_id, cycle_id, member_id, amount, currency_code, dated_on, recorded_at,
        account_id, reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, $4, 10, 'USD', '2026-07-01', now(), $5, 'regularized', now(), $6, 'member')`,
      [contributionId, fixture.orgId, cycleId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);
      await client.query(`INSERT INTO repayment (
        id, org_id, loan_id, member_id, amount, currency_code, applied_to_principal,
        applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id,
        reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, $4, 10, 'USD', 8, 2, 0, '2026-07-01', now(), $5,
        'regularized', now(), $6, 'member')`,
      [repaymentId, fixture.orgId, loanId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);
      await client.query(`INSERT INTO withdrawal (
        id, org_id, member_id, amount, currency_code, dated_on, recorded_at, kind,
        created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-01', now(), 'other', now(), $4, 'member')`,
      [withdrawalId, fixture.orgId, fixture.memberId, fixture.actorId]);
      await client.query(`INSERT INTO transfer (
        id, org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
        purpose, created_at, created_by
      ) VALUES ($1, $2, $3, $4, 10, 'USD', '2026-07-01', 'transfer', now(), $5)`,
      [transferId, fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, fixture.actorId]);

      await expectRejected(client, `INSERT INTO contribution (
        org_id, cycle_id, member_id, amount, currency_code, dated_on, recorded_at, account_id,
        reconciliation_status, reverses_id, reverse_reason, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, -10, 'USD', '2026-07-02', now(), $4, 'regularized', $5,
        'wrong member', now(), $6, 'member')`,
      [fixture.orgId, cycleId, fixture.otherMemberId, fixture.groupAccountId, contributionId, fixture.actorId],
      { code: "23514", message: "contribution_reversal_mismatch" });
      await expectRejected(client, `INSERT INTO repayment (
        org_id, loan_id, member_id, amount, currency_code, applied_to_principal, applied_to_interest,
        applied_to_fee, dated_on, recorded_at, account_id, reconciliation_status, reverses_id,
        reverse_reason, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, -10, 'USD', 9, 1, 0, '2026-07-02', now(), $4,
        'regularized', $5, 'wrong split', now(), $6, 'member')`,
      [fixture.orgId, loanId, fixture.memberId, fixture.groupAccountId, repaymentId, fixture.actorId],
      { code: "23514", message: "repayment_reversal_mismatch" });
      await expectRejected(client, `INSERT INTO withdrawal (
        org_id, member_id, amount, currency_code, dated_on, recorded_at, kind, reverses_id,
        reverse_reason, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, 10, 'USD', '2026-07-02', now(), 'year_end_reversal', $3,
        'wrong kind', now(), $4, 'member')`, [fixture.orgId, fixture.memberId, withdrawalId, fixture.actorId],
      { code: "23514", message: "withdrawal_reversal_mismatch" });
      await expectRejected(client, `INSERT INTO expense (
        org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on, status,
        recorded_at, account_id, category, reverses_id, reverse_reason, created_at, created_by, created_by_kind
      ) VALUES ($1, 'Wrong kind', 4, 'USD', $2, '2026-07-23', 'paid', now(), $3,
        'supplies', $4, 'wrong beneficiary', now(), $5, 'member')`,
      [fixture.orgId, fixture.otherMemberId, fixture.groupAccountId, fixture.wrongKindExpenseId, fixture.actorId],
      { code: "23514", message: "expense_reversal_mismatch" });
      await expectRejected(client, `INSERT INTO transfer (
        org_id, from_account_id, to_account_id, amount, currency_code, dated_on, purpose,
        reverses_id, created_at, created_by
      ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-02', 'wrong_reversal', $4, now(), $5)`,
      [fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, transferId, fixture.actorId],
      { code: "23514", message: "transfer_reversal_mismatch" });
      const rejectedRows = await client.query(`
        SELECT
          (SELECT count(*) FROM contribution WHERE reverses_id = $1)::int
          + (SELECT count(*) FROM repayment WHERE reverses_id = $2)::int
          + (SELECT count(*) FROM withdrawal WHERE reverses_id = $3)::int
          + (SELECT count(*) FROM expense WHERE reverses_id = $4)::int
          + (SELECT count(*) FROM transfer WHERE reverses_id = $5)::int AS rejected_count
      `, [contributionId, repaymentId, withdrawalId, fixture.wrongKindExpenseId, transferId]);
      expect(rejectedRows.rows).toEqual([{ rejected_count: 0 }]);

      const firstPayoutCollection = randomUUID();
      await client.query(`INSERT INTO extraordinary_collection (
        id, org_id, kind, purpose, beneficiary_member_id, status, opened_on, paid_out_expense_id,
        created_at, created_by
      ) VALUES ($1, $2, 'solidarity', 'First payout binding', $3, 'closed', '2026-07-01', $4, now(), $5)`,
      [firstPayoutCollection, fixture.orgId, fixture.memberId, fixture.paidExpenseId, fixture.actorId]);
      await expectRejected(client, `INSERT INTO extraordinary_collection (
        org_id, kind, purpose, beneficiary_member_id, status, opened_on, paid_out_expense_id, created_at, created_by
      ) VALUES ($1, 'solidarity', 'Duplicate payout binding', $2, 'closed', '2026-07-01', $3, now(), $4)`,
      [fixture.orgId, fixture.memberId, fixture.paidExpenseId, fixture.actorId], { code: "23505" });

      const returnTransferId = randomUUID();
      await client.query(`INSERT INTO transfer (
        id, org_id, from_account_id, to_account_id, amount, currency_code, dated_on, purpose,
        regularizes_kind, created_at, created_by
      ) VALUES ($1, $2, $3, $4, 3, 'USD', '2026-07-22', 'collection_surplus_return',
        'extraordinary_collection', now(), $5)`,
      [returnTransferId, fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, fixture.actorId]);
      await client.query(`INSERT INTO extraordinary_collection (
        org_id, kind, purpose, beneficiary_member_id, status, opened_on, surplus_amount,
        disposition, surplus_transfer_id, created_at, created_by
      ) VALUES ($1, 'solidarity', 'First return binding', $2, 'cancelled', '2026-07-01', 3,
        'returned', $3, now(), $4)`, [fixture.orgId, fixture.memberId, returnTransferId, fixture.actorId]);
      await expectRejected(client, `INSERT INTO extraordinary_collection (
        org_id, kind, purpose, beneficiary_member_id, status, opened_on, surplus_amount,
        disposition, surplus_transfer_id, created_at, created_by
      ) VALUES ($1, 'solidarity', 'Duplicate return binding', $2, 'cancelled', '2026-07-01', 3,
        'returned', $3, now(), $4)`, [fixture.orgId, fixture.memberId, returnTransferId, fixture.actorId],
      { code: "23505" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("accepts a signed repayment reversal when its absolute allocation mirrors the original", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const loanId = randomUUID();
      const repaymentId = randomUUID();
      await client.query(`INSERT INTO loan (
        id, org_id, member_id, borrower_kind, borrower_member_id, principal_amount, currency_code,
        rate_value, rate_model, term_periods, grace_periods, originated_on, status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, 'member', $3, 10, 'USD', 1, 'declining_balance', 1, 0,
        '2026-07-01', 'originated', now(), $4, 'member')`,
      [loanId, fixture.orgId, fixture.memberId, fixture.actorId]);
      await client.query(`INSERT INTO repayment (
        id, org_id, loan_id, member_id, amount, currency_code, applied_to_principal,
        applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id,
        reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, $4, 10, 'USD', 8, 1.5, 0.5, '2026-07-01', now(), $5,
        'regularized', now(), $6, 'member')`,
      [repaymentId, fixture.orgId, loanId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);

      const reversal = await client.query(`INSERT INTO repayment (
        org_id, loan_id, member_id, amount, currency_code, applied_to_principal, applied_to_interest,
        applied_to_fee, dated_on, recorded_at, account_id, reconciliation_status, reverses_id,
        reverse_reason, created_at, created_by, created_by_kind
      ) VALUES ($1, $2, $3, -10, 'USD', -8, -1.5, -0.5, '2026-07-02', now(), $4,
        'regularized', $5, 'Correct signed allocation reversal', now(), $6, 'member')
      RETURNING amount, applied_to_principal, applied_to_interest, applied_to_fee, reverses_id`,
      [fixture.orgId, loanId, fixture.memberId, fixture.groupAccountId, repaymentId, fixture.actorId]);

      expect(reversal.rows).toEqual([{
        amount: "-10.0000",
        applied_to_principal: "-8.0000",
        applied_to_interest: "-1.5000",
        applied_to_fee: "-0.5000",
        reverses_id: repaymentId,
      }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("fails an upgrade with stable actionable 23514 when legacy reversals are duplicated", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      await client.query("DROP INDEX uq_expense_reverses_once");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(`INSERT INTO expense (
        org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on, status,
        recorded_at, account_id, category, reverses_id, reverse_reason, created_at, created_by, created_by_kind
      ) VALUES
        ($1, 'Wrong kind', 4, 'USD', $2, '2026-07-23', 'paid', now(), $3, 'supplies', $4,
          'Legacy duplicate one', now(), $5, 'member'),
        ($1, 'Wrong kind', 4, 'USD', $2, '2026-07-24', 'paid', now(), $3, 'supplies', $4,
          'Legacy duplicate two', now(), $5, 'member')`,
      [fixture.orgId, fixture.memberId, fixture.groupAccountId, fixture.wrongKindExpenseId, fixture.actorId]);
      const preflight = readFileSync(reversalBindingGuardMigrationUrl, "utf8").split("CREATE UNIQUE INDEX")[0] ?? "";
      await expectRejected(client, preflight, [], {
        code: "23514", message: "sprint9_reversal_preflight_duplicate",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  it("ships a later additive NULL payout-account guard without editing the holding migration", () => {
    expect(existsSync(payoutAccountRequiredMigrationUrl)).toBe(true);
    const migration = readFileSync(payoutAccountRequiredMigrationUrl, "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION validate_collection_payout_holding()");
    expect(migration).toContain("payout_account_id IS NULL");
    expect(migration).toContain("collection_payout_account_required");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });

  it("ships an additive active-treasurer uniqueness fence with a stable legacy-data preflight", () => {
    expect(existsSync(activeTreasurerUniquenessMigrationUrl)).toBe(true);
    const migration = readFileSync(activeTreasurerUniquenessMigrationUrl, "utf8");
    expect(migration).toContain("LOCK TABLE public.member IN SHARE ROW EXCLUSIVE MODE");
    expect(migration).toContain("GROUP BY org_id");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("active_treasurer_uniqueness_preflight_failed");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).toContain("CREATE UNIQUE INDEX uq_member_org_single_active_treasurer");
    expect(migration).toContain("WHERE role = 'tesorera' AND status = 'activo'");
  });

  it("ships an additive tenant-safe finite-money repair", () => {
    expect(existsSync(tenantFiniteMigrationUrl)).toBe(true);
    const migration = readFileSync(tenantFiniteMigrationUrl, "utf8");
    expect(migration).toContain("fk_extraordinary_collection_beneficiary_org");
    expect(migration).toContain("ck_expense_amount_finite");
    expect(migration).toContain("'NaN'::numeric");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_extraordinary_collection_line_reverses");
    expect(migration).toContain("ALTER FUNCTION allow_extraordinary_collection_line_regularization()");
  });

  it("ships an additive terminal-state INSERT guard with a stable domain error", () => {
    expect(existsSync(lineOpenGuardMigrationUrl)).toBe(true);
    const migration = readFileSync(lineOpenGuardMigrationUrl, "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION validate_extraordinary_collection_line_insert()");
    expect(migration).toContain("collection.status NOT IN ('open', 'collecting')");
    expect(migration).toContain("MESSAGE = 'collection_not_collecting'");
    expect(migration).toContain("ERRCODE = '23514'");
  });

  it("ships additive collection regularization reversal, zero, and paging guards", () => {
    expect(existsSync(regularizationReversalMigrationUrl)).toBe(true);
    const migration = readFileSync(regularizationReversalMigrationUrl, "utf8");
    expect(migration).toContain("collection_line_regularization_active");
    expect(migration).toContain("regularization_reversal_requires_reopen");
    expect(migration).toContain("regularization_reversal_invalid");
    expect(migration).toContain("ck_extraordinary_collection_line_zero_regularized");
    expect(migration).toContain("idx_collection_line_pending_page");
    expect(migration).toContain("idx_transfer_live_regularization_coverage");
  });

  it("pins tenant-scoped live-original guards for contribution and repayment regularization", () => {
    expect(existsSync(regularizationLiveSourceMigrationUrl)).toBe(true);
    const migration = readFileSync(regularizationLiveSourceMigrationUrl, "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION validate_regularization_transfer()");
    expect(migration).toContain("FROM contribution reversal");
    expect(migration).toContain("reversal.org_id = c.org_id AND reversal.reverses_id = c.id");
    expect(migration).toContain("FROM repayment reversal");
    expect(migration).toContain("reversal.org_id = r.org_id AND reversal.reverses_id = r.id");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).toContain("regularization_amount_invalid");
    expect(migration).toContain("regularization_amount_exceeds_remaining");
    expect(migration).toContain("extraordinary_collection_line");
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });

  runIfDatabase("rejects pending zero collection lines at the database boundary", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 0, $4, 'pending', '2026-07-21', now(), $5)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.personalAccountId, fixture.actorId], {
        code: "23514", message: "ck_extraordinary_collection_line_zero_regularized",
      });
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 0, $4, 'regularized', '2026-07-21', now(), $5)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.personalAccountId, fixture.actorId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("binds collection line and transfer reversals to live regularization state", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      const pendingLineId = await insertLine(client, fixture, collectionId, {
        amount: 10, accountId: fixture.personalAccountId, status: "pending",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      const partial = await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 4, 'USD', '2026-07-22', 'regularization',
          'extraordinary_collection', $4, now(), $5)
        RETURNING id
      `, [fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, pendingLineId, fixture.actorId]);
      const partialId = partial.rows[0].id as string;

      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'pending', '2026-07-21', $5,
          'Correction with live transfer', now(), $6)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.personalAccountId, pendingLineId, fixture.actorId], {
        code: "23514", message: "collection_line_regularization_active",
      });
      await expectRejected(client, `
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, reverses_id, created_at, created_by
        ) VALUES ($1, $2, $3, 3, 'USD', '2026-07-23', 'regularization_reversal',
          'extraordinary_collection', $4, $5, now(), $6)
      `, [fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, pendingLineId, partialId, fixture.actorId], {
        code: "23514", message: "regularization_reversal_invalid",
      });
      await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, reverses_id, created_at, created_by
        ) VALUES ($1, $2, $3, 4, 'USD', '2026-07-23', 'regularization_reversal',
          'extraordinary_collection', $4, $5, now(), $6)
      `, [fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, pendingLineId, partialId, fixture.actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'pending', '2026-07-21', $5,
          'Correction after transfer reversal', now(), $6)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.personalAccountId, pendingLineId, fixture.actorId]);

      const fullCollectionId = await insertCollection(client, fixture);
      const fullLineId = await insertLine(client, fixture, fullCollectionId, {
        amount: 10, accountId: fixture.personalAccountId, status: "pending",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [fullCollectionId]);
      const full = await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-22', 'regularization',
          'extraordinary_collection', $4, now(), $5)
        RETURNING id
      `, [fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, fullLineId, fixture.actorId]);
      await client.query(
        "UPDATE extraordinary_collection_line SET reconciliation_status = 'regularized' WHERE id = $1",
        [fullLineId],
      );
      await expectRejected(client, `
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, reverses_id, created_at, created_by
        ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-23', 'regularization_reversal',
          'extraordinary_collection', $4, $5, now(), $6)
      `, [fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, fullLineId,
        full.rows[0].id, fixture.actorId], {
        code: "23514", message: "regularization_reversal_requires_reopen",
      });
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'regularized', '2026-07-21', $5,
          'Correction after full coverage', now(), $6)
      `, [fixture.orgId, fullCollectionId, fixture.memberId, fixture.personalAccountId, fullLineId, fixture.actorId], {
        code: "23514", message: "collection_line_regularization_active",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase.each(["paid_out", "closed", "cancelled"] as const)(
    "rejects direct line and reversal inserts after a collection is %s",
    async (terminalStatus) => {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const fixture = await seedFixture(client);
        const collectionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
        const originalId = await insertLine(client, fixture, collectionId, { amount: 10 });
        await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
        if (terminalStatus === "cancelled") {
          await client.query(`
            UPDATE extraordinary_collection
            SET status = 'cancelled', surplus_amount = 10, disposition = 'retained',
                disposition_motive = 'Assembly cancellation vote'
            WHERE id = $1
          `, [collectionId]);
        } else {
          await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);
          if (terminalStatus === "closed") {
            await client.query(`
              UPDATE extraordinary_collection
              SET status = 'closed', surplus_amount = 10, disposition = 'retained',
                  disposition_motive = 'Assembly closing vote'
              WHERE id = $1
            `, [collectionId]);
          }
        }

        await expectRejected(client, `
          INSERT INTO extraordinary_collection_line (
            org_id, collection_id, member_id, amount, account_id, reconciliation_status,
            dated_on, created_at, created_by
          ) VALUES ($1, $2, $3, 1, $4, 'regularized', '2026-07-23', now(), $5)
        `, [fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId, fixture.actorId], {
          code: "23514", message: "collection_not_collecting",
        });
        await expectRejected(client, `
          INSERT INTO extraordinary_collection_line (
            org_id, collection_id, member_id, amount, account_id, reconciliation_status,
            dated_on, reverses_id, reverse_reason, created_at, created_by
          ) VALUES ($1, $2, $3, 10, $4, 'regularized', '2026-07-21', $5,
            'Terminal reversal blocked', now(), $6)
        `, [
          fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId,
          originalId, fixture.actorId,
        ], { code: "23514", message: "collection_not_collecting" });
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );

  runIfDatabase("allows only the legal header lifecycle and exact line regularization", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const orgId = randomUUID();
    const actorId = randomUUID();
    const memberId = randomUUID();
    const groupAccountId = randomUUID();
    const personalAccountId = randomUUID();
    const collectionId = randomUUID();
    const pendingLineId = randomUUID();
    const expenseId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES ($1, 'CHG-011', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
          'active', now(), $2, 'system')
      `, [orgId, actorId]);
      await client.query(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Beneficiary', '2026-01-01', 'aportante', 'activo', 0,
          now(), $3, 'member')
      `, [memberId, orgId, actorId]);
      await client.query(`
        INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
        VALUES
          ($1, $3, 'Group fund', 'group_bank', true, 'active', now(), $4),
          ($2, $3, 'Personal', 'treasurer_personal', false, 'active', now(), $4)
      `, [groupAccountId, personalAccountId, orgId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, beneficiary_member_id, target_amount, status,
          opened_on, created_at, created_by
        ) VALUES ($1, $2, 'solidarity', 'Calamidad', $3, 30, 'open', '2026-07-21', now(), $4)
      `, [collectionId, orgId, memberId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 30, $4, 'regularized', '2026-07-21', now(), $5)
      `, [orgId, collectionId, memberId, groupAccountId, actorId]);
      await client.query(
        "UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1 AND org_id = $2",
        [collectionId, orgId],
      );
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Solidarity payout', 20, 'USD', $3, '2026-07-22',
          'paid', now(), $4, 'solidarity_payout', now(), $5, 'member')
      `, [expenseId, orgId, memberId, groupAccountId, actorId]);
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'paid_out', paid_out_expense_id = $1
        WHERE id = $2 AND org_id = $3
      `, [expenseId, collectionId, orgId]);
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10, disposition = 'retained',
            disposition_motive = 'Assembly vote'
        WHERE id = $1 AND org_id = $2
      `, [collectionId, orgId]);

      const openCancellationId = randomUUID();
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, status, opened_on, created_at, created_by
        ) VALUES ($1, $2, 'solidarity', 'Unused', 'open', '2026-07-21', now(), $3)
      `, [openCancellationId, orgId, actorId]);
      await client.query(`
        UPDATE extraordinary_collection SET status = 'cancelled', surplus_amount = 0
        WHERE id = $1 AND org_id = $2
      `, [openCancellationId, orgId]);

      const collectingCancellationId = randomUUID();
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, status, opened_on, created_at, created_by
        ) VALUES ($1, $2, 'solidarity', 'Cancelled after collection', 'open', '2026-07-21', now(), $3)
      `, [collectingCancellationId, orgId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 5, $4, 'regularized', '2026-07-21', now(), $5)
      `, [orgId, collectingCancellationId, memberId, groupAccountId, actorId]);
      await client.query(
        "UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1",
        [collectingCancellationId],
      );
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 5, disposition = 'retained',
            disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [collectingCancellationId]);

      const pendingCollectionId = randomUUID();
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, status, opened_on, created_at, created_by
        ) VALUES ($1, $2, 'solidarity', 'Pending regularization', 'open', '2026-07-21', now(), $3)
      `, [pendingCollectionId, orgId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          id, org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, $4, 7, $5, 'pending', '2026-07-21', now(), $6)
      `, [pendingLineId, orgId, pendingCollectionId, memberId, personalAccountId, actorId]);
      await client.query(
        "UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1",
        [pendingCollectionId],
      );
      await client.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 7, 'USD', '2026-07-22', 'regularization',
          'extraordinary_collection', $4, now(), $5)
      `, [orgId, personalAccountId, groupAccountId, pendingLineId, actorId]);
      await client.query(
        "UPDATE extraordinary_collection_line SET reconciliation_status = 'regularized' WHERE id = $1",
        [pendingLineId],
      );

      const rows = await client.query(
        "SELECT status, surplus_amount, disposition FROM extraordinary_collection WHERE id = $1",
        [collectionId],
      );
      expect(rows.rows).toEqual([{ status: "closed", surplus_amount: "10.0000", disposition: "retained" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects state skips, regressions, immutable edits, line mutations, and deletes", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const orgId = randomUUID();
    const actorId = randomUUID();
    const memberId = randomUUID();
    const accountId = randomUUID();
    const collectionId = randomUUID();
    const deleteCandidateId = randomUUID();
    const lineId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO organization (
          id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind
        ) VALUES ($1, 'CHG-011 adverse', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
          'active', now(), $2, 'system')
      `, [orgId, actorId]);
      await client.query(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Member', '2026-01-01', 'aportante', 'activo', 0,
          now(), $3, 'member')
      `, [memberId, orgId, actorId]);
      await client.query(`
        INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
        VALUES ($1, $2, 'Fund', 'group_bank', true, 'active', now(), $3)
      `, [accountId, orgId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, beneficiary_member_id, status, opened_on,
          recognition_fiscal_year, created_at, created_by
        ) VALUES ($1, $2, 'treasurer_recognition', 'Recognition', $3, 'open',
          '2026-07-21', 2026, now(), $4)
      `, [collectionId, orgId, memberId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection (
          id, org_id, kind, purpose, status, opened_on, created_at, created_by
        ) VALUES ($1, $2, 'solidarity', 'Delete guard', 'open', '2026-07-21', now(), $3)
      `, [deleteCandidateId, orgId, actorId]);
      await client.query(`
        INSERT INTO extraordinary_collection_line (
          id, org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, $4, 10, $5, 'regularized', '2026-07-21', now(), $6)
      `, [lineId, orgId, collectionId, memberId, accountId, actorId]);

      await expectRejected(client,
        "UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);
      await client.query(
        "UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection SET purpose = 'Edited' WHERE id = $1", [collectionId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection SET recognition_fiscal_year = 2027 WHERE id = $1", [collectionId]);
      await client.query(
        "UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10, disposition = 'retained',
            disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [collectionId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection SET recognition_fiscal_year = 2027 WHERE id = $1", [collectionId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection_line SET reconciliation_status = 'pending' WHERE id = $1", [lineId]);
      await expectRejected(client,
        "UPDATE extraordinary_collection_line SET amount = 11 WHERE id = $1", [lineId]);
      await expectRejected(client, "DELETE FROM extraordinary_collection_line WHERE id = $1", [lineId]);
      await expectRejected(client, "DELETE FROM extraordinary_collection WHERE id = $1", [deleteCandidateId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects a positive close surplus with NULL disposition metadata", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      await insertLine(client, fixture, collectionId);
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10
        WHERE id = $1
      `, [collectionId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects a positive cancellation surplus with NULL disposition metadata", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId);
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 10
        WHERE id = $1
      `, [collectionId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("requires an exact nonblank reversal reason pair", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      const originalId = await insertLine(client, fixture, collectionId);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'regularized', '2026-07-21', $5, NULL, now(), $6)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId, originalId, fixture.actorId]);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'regularized', '2026-07-21', $5, '  ', now(), $6)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId, originalId, fixture.actorId]);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, 10, $4, 'regularized', '2026-07-21', NULL, 'orphan reason', now(), $5)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects paid-out expense links outside paid_out or closed", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      for (const status of ["open", "collecting"] as const) {
        await expectRejected(client, `
          INSERT INTO extraordinary_collection (
            org_id, kind, purpose, status, opened_on, paid_out_expense_id, created_at, created_by
          ) VALUES ($1, 'solidarity', 'Illicit payout seed', $2, '2026-07-21', $3, now(), $4)
        `, [fixture.orgId, status, fixture.paidExpenseId, fixture.actorId]);
      }
      await expectRejected(client, `
        INSERT INTO extraordinary_collection (
          org_id, kind, purpose, status, opened_on, paid_out_expense_id,
          surplus_amount, created_at, created_by
        ) VALUES ($1, 'solidarity', 'Illicit cancelled payout', 'cancelled',
          '2026-07-21', $2, 0, now(), $3)
      `, [fixture.orgId, fixture.paidExpenseId, fixture.actorId]);

      const openId = await insertCollection(client, fixture);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'cancelled', paid_out_expense_id = $2, surplus_amount = 0
        WHERE id = $1
      `, [openId, fixture.paidExpenseId]);

      const collectingId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectingId);
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectingId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'cancelled', paid_out_expense_id = $2, surplus_amount = 10,
            disposition = 'retained', disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [collectingId, fixture.paidExpenseId]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects wrong surplus, pending balances, and invalid payout expenses", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);

      const solidarityId = await insertCollection(client, fixture);
      await insertLine(client, fixture, solidarityId, { amount: 10 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [solidarityId]);
      for (const expenseId of [
        null,
        fixture.plannedExpenseId,
        fixture.wrongKindExpenseId,
        fixture.otherOrgExpenseId,
      ]) {
        await expectRejected(client, `
          UPDATE extraordinary_collection
          SET status = 'paid_out', paid_out_expense_id = $2
          WHERE id = $1
        `, [solidarityId, expenseId]);
      }
      await client.query(`
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2
        WHERE id = $1
      `, [solidarityId, fixture.paidExpenseId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 7, disposition = 'retained',
            disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [solidarityId]);

      const cancellationId = await insertCollection(client, fixture);
      await insertLine(client, fixture, cancellationId, { amount: 10 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [cancellationId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 9, disposition = 'retained',
            disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [cancellationId]);

      const pendingId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      await insertLine(client, fixture, pendingId, {
        accountId: fixture.personalAccountId,
        status: "pending",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [pendingId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out'
        WHERE id = $1
      `, [pendingId], { code: "23514", message: "collection_pending_regularization" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("nets signed reversals in regularized and pending balances", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);

      const closedId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      const regularizedId = await insertLine(client, fixture, closedId, { amount: 10 });
      await insertLine(client, fixture, closedId, {
        amount: 10,
        reversesId: regularizedId,
        reverseReason: "Entry reversed",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [closedId]);
      await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [closedId]);
      await client.query("UPDATE extraordinary_collection SET status = 'closed', surplus_amount = 0 WHERE id = $1", [closedId]);

      const cancelledId = await insertCollection(client, fixture);
      const pendingId = await insertLine(client, fixture, cancelledId, {
        amount: 8,
        accountId: fixture.personalAccountId,
        status: "pending",
      });
      await insertLine(client, fixture, cancelledId, {
        amount: 8,
        accountId: fixture.personalAccountId,
        status: "pending",
        reversesId: pendingId,
        reverseReason: "Deposit reversed",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [cancelledId]);
      await client.query("UPDATE extraordinary_collection SET status = 'cancelled', surplus_amount = 0 WHERE id = $1", [cancelledId]);

      const statuses = await client.query(
        "SELECT status FROM extraordinary_collection WHERE id = ANY($1::uuid[]) ORDER BY status",
        [[closedId, cancelledId]],
      );
      expect(statuses.rows).toEqual([{ status: "cancelled" }, { status: "closed" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects inactive, wrong-type, and cross-tenant regularization accounts", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      const activeSourceId = await insertLine(client, fixture, collectionId, {
        accountId: fixture.personalAccountId,
        status: "pending",
      });
      const inactiveSourceId = await insertLine(client, fixture, collectionId, {
        accountId: fixture.inactivePersonalAccountId,
        status: "pending",
      });
      const groupSourceId = await insertLine(client, fixture, collectionId, {
        accountId: fixture.groupAccountId,
        status: "pending",
      });

      const transferSql = `
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 10, 'USD', '2026-07-22', 'regularization',
          'extraordinary_collection', $4, now(), $5)
      `;
      await expectRejected(client, transferSql, [
        fixture.orgId, fixture.inactivePersonalAccountId, fixture.groupAccountId,
        inactiveSourceId, fixture.actorId,
      ]);
      await expectRejected(client, transferSql, [
        fixture.orgId, fixture.groupAccountId, fixture.groupAccountId,
        groupSourceId, fixture.actorId,
      ]);
      await expectRejected(client, transferSql, [
        fixture.orgId, fixture.personalAccountId, fixture.inactiveGroupAccountId,
        activeSourceId, fixture.actorId,
      ]);
      await expectRejected(client, transferSql, [
        fixture.orgId, fixture.personalAccountId, fixture.personalAccountId,
        activeSourceId, fixture.actorId,
      ]);
      await expectRejected(client, transferSql, [
        fixture.orgId, fixture.personalAccountId, fixture.otherGroupAccountId,
        activeSourceId, fixture.actorId,
      ]);
      await expectRejected(client, transferSql, [
        fixture.otherOrgId, fixture.otherPersonalAccountId, fixture.otherGroupAccountId,
        activeSourceId, fixture.actorId,
      ]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("binds every reversal to one exact original globally", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      const otherCollectionId = await insertCollection(client, fixture);
      const originalId = await insertLine(client, fixture, collectionId, { amount: 10 });
      const reversalSql = `
        INSERT INTO extraordinary_collection_line (
          id, org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, reverses_id, reverse_reason, created_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-07-21', $8, 'Exact reversal', now(), $9)
      `;
      const mismatchCases: Array<[string, unknown[], string]> = [
        ["cross tenant", [randomUUID(), fixture.otherOrgId, collectionId, fixture.memberId, 10, fixture.groupAccountId, "regularized", originalId, fixture.actorId], "collection_not_found"],
        ["cross collection", [randomUUID(), fixture.orgId, otherCollectionId, fixture.memberId, 10, fixture.groupAccountId, "regularized", originalId, fixture.actorId], "collection_line_reversal"],
        ["member", [randomUUID(), fixture.orgId, collectionId, fixture.otherMemberId, 10, fixture.groupAccountId, "regularized", originalId, fixture.actorId], "collection_line_reversal"],
        ["account", [randomUUID(), fixture.orgId, collectionId, fixture.memberId, 10, fixture.personalAccountId, "regularized", originalId, fixture.actorId], "collection_line_reversal"],
        ["status", [randomUUID(), fixture.orgId, collectionId, fixture.memberId, 10, fixture.groupAccountId, "pending", originalId, fixture.actorId], "collection_line_reversal"],
        ["amount", [randomUUID(), fixture.orgId, collectionId, fixture.memberId, 9, fixture.groupAccountId, "regularized", originalId, fixture.actorId], "collection_line_reversal"],
      ];
      for (const [, values, message] of mismatchCases) {
        await expectRejected(client, reversalSql, values, {
          code: "23514",
          message,
        });
      }

      const reversalId = randomUUID();
      await client.query(reversalSql, [
        reversalId, fixture.orgId, collectionId, fixture.memberId, 10,
        fixture.groupAccountId, "regularized", originalId, fixture.actorId,
      ]);
      await expectRejected(client, reversalSql, [
        randomUUID(), fixture.orgId, collectionId, fixture.memberId, 10,
        fixture.groupAccountId, "regularized", reversalId, fixture.actorId,
      ], { code: "23514", message: "collection_line_reversal_target_invalid" });
      await expectRejected(client, reversalSql, [
        randomUUID(), fixture.orgId, collectionId, fixture.memberId, 10,
        fixture.groupAccountId, "regularized", originalId, fixture.actorId,
      ], { code: "23505", message: "collection_line_already_reversed" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("binds returned surplus to one exact live collection transfer", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      const unrelatedCollectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId, { amount: 10 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);

      const transferSql = `
        INSERT INTO transfer (
          id, org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, reverses_id, created_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'USD', '2026-07-22', $6, $7, $8, $9, now(), $10)
      `;
      const makeTransfer = async (overrides: Partial<{
        orgId: string; from: string; to: string; amount: number; purpose: string;
        kind: string | null; targetId: string | null; reversesId: string | null;
      }> = {}) => {
        const id = randomUUID();
        await client.query(transferSql, [
          id,
          overrides.orgId ?? fixture.orgId,
          overrides.from ?? fixture.groupAccountId,
          overrides.to ?? fixture.personalAccountId,
          overrides.amount ?? 10,
          overrides.purpose ?? "collection_surplus_return",
          overrides.kind === undefined ? "extraordinary_collection" : overrides.kind,
          overrides.targetId === undefined ? collectionId : overrides.targetId,
          overrides.reversesId ?? null,
          fixture.actorId,
        ]);
        return id;
      };
      const closeWith = (transferId: string) => expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10, disposition = 'returned',
            surplus_transfer_id = $2
        WHERE id = $1
      `, [collectionId, transferId], {
        code: "23514",
        message: "collection_surplus_return_invalid",
      });

      await closeWith(await makeTransfer({
        orgId: fixture.otherOrgId,
        from: fixture.otherGroupAccountId,
        to: fixture.otherPersonalAccountId,
      }));
      await closeWith(await makeTransfer({ amount: 9 }));
      await closeWith(await makeTransfer({ purpose: "transfer" }));
      await closeWith(await makeTransfer({ kind: null }));
      await closeWith(await makeTransfer({ targetId: unrelatedCollectionId }));
      await closeWith(await makeTransfer({ to: fixture.secondGroupAccountId }));
      await closeWith(await makeTransfer({ to: fixture.inactivePersonalAccountId }));
      await closeWith(await makeTransfer({ from: fixture.personalAccountId, to: fixture.secondPersonalAccountId }));
      await closeWith(await makeTransfer({ from: fixture.inactiveGroupAccountId }));

      const reversedId = await makeTransfer();
      await makeTransfer({
        from: fixture.personalAccountId,
        to: fixture.groupAccountId,
        purpose: "collection_surplus_return_reversal",
        kind: "extraordinary_collection",
        targetId: collectionId,
        reversesId: reversedId,
      });
      await closeWith(reversedId);

      const validId = await makeTransfer();
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10, disposition = 'returned',
            surplus_transfer_id = $2
        WHERE id = $1
      `, [collectionId, validId]);
      await expectRejected(client, transferSql, [
        randomUUID(), fixture.orgId, fixture.personalAccountId, fixture.groupAccountId,
        10, "collection_surplus_return_reversal", "extraordinary_collection", collectionId, validId, fixture.actorId,
      ], { code: "23514", message: "collection_surplus_transfer_reversal_forbidden" });

      const cancelledId = await insertCollection(client, fixture);
      await insertLine(client, fixture, cancelledId, { amount: 6 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [cancelledId]);
      const cancelTransferId = randomUUID();
      await client.query(transferSql, [
        cancelTransferId, fixture.orgId, fixture.groupAccountId, fixture.personalAccountId,
        6, "collection_surplus_return", "extraordinary_collection", cancelledId, null, fixture.actorId,
      ]);
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'cancelled', surplus_amount = 6, disposition = 'returned',
            surplus_transfer_id = $2
        WHERE id = $1
      `, [cancelledId, cancelTransferId]);
      const result = await client.query("SELECT status, disposition FROM extraordinary_collection WHERE id = $1", [collectionId]);
      expect(result.rows).toEqual([{ status: "closed", disposition: "returned" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("enforces payout holdings and permits only an exact governed reversal", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, collectionId, { amount: 3 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      const nullAccountExpenseId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'NULL account payout', 2, 'USD', $3, '2026-07-22', 'paid', now(),
          NULL, 'solidarity_payout', now(), $4, 'member')
      `, [nullAccountExpenseId, fixture.orgId, fixture.memberId, fixture.actorId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, nullAccountExpenseId], {
        code: "23514",
        message: "collection_payout_account_required",
      });
      const unchangedAfterNullAccount = await client.query(`
        SELECT status, paid_out_expense_id FROM extraordinary_collection WHERE id = $1
      `, [collectionId]);
      expect(unchangedAfterNullAccount.rows).toEqual([{
        status: "collecting",
        paid_out_expense_id: null,
      }]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, fixture.paidExpenseId], {
        code: "23514",
        message: "solidarity_payout_amount_invalid",
      });
      const zeroExpenseId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Zero payout', 0, 'USD', $3, '2026-07-22', 'paid', now(),
          $4, 'solidarity_payout', now(), $5, 'member')
      `, [zeroExpenseId, fixture.orgId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, zeroExpenseId], {
        code: "23514",
        message: "solidarity_payout_amount_invalid",
      });

      const pendingCollectionId = await insertCollection(client, fixture);
      await insertLine(client, fixture, pendingCollectionId, {
        amount: 4,
        accountId: fixture.personalAccountId,
        status: "pending",
      });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [pendingCollectionId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [pendingCollectionId, fixture.paidExpenseId], {
        code: "23514",
        message: "collection_pending_regularization",
      });

      const wrongBeneficiaryId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Wrong beneficiary', 2, 'USD', $3, '2026-07-22',
          'paid', now(), $4, 'solidarity_payout', now(), $5, 'member')
      `, [wrongBeneficiaryId, fixture.orgId, fixture.otherMemberId, fixture.groupAccountId, fixture.actorId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, wrongBeneficiaryId], {
        code: "23514",
        message: "solidarity_payout_beneficiary_mismatch",
      });

      const reversedExpenseId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, reverses_id, reverse_reason, account_id, category,
          created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'reversal: pago solidario', 4, 'USD', $3, '2026-07-22', 'paid', now(),
          $4, 'Pre-link reversal', $5, 'solidarity_payout', now(), $6, 'member')
      `, [reversedExpenseId, fixture.orgId, fixture.memberId, fixture.paidExpenseId, fixture.groupAccountId, fixture.actorId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, reversedExpenseId], {
        code: "23514",
        message: "solidarity_payout_expense_reversed",
      });
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, fixture.paidExpenseId], {
        code: "23514",
        message: "solidarity_payout_expense_reversed",
      });

      const unrelatedHoldingExpenseId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Unrelated holding payout', 2, 'USD', $3, '2026-07-22', 'paid', now(),
          $4, 'solidarity_payout', now(), $5, 'member')
      `, [unrelatedHoldingExpenseId, fixture.orgId, fixture.memberId, fixture.secondGroupAccountId, fixture.actorId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, unrelatedHoldingExpenseId], {
        code: "23514",
        message: "collection_payout_holding_insufficient",
      });

      const liveExpenseId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Live payout', 2, 'USD', $3, '2026-07-22', 'paid', now(),
          $4, 'solidarity_payout', now(), $5, 'member')
      `, [liveExpenseId, fixture.orgId, fixture.memberId, fixture.groupAccountId, fixture.actorId]);
      await client.query(`
        UPDATE extraordinary_collection SET status = 'paid_out', paid_out_expense_id = $2 WHERE id = $1
      `, [collectionId, liveExpenseId]);
      await client.query(`
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 1, disposition = 'retained',
            disposition_motive = 'Assembly correction vote'
        WHERE id = $1
      `, [collectionId]);
      await expectRejected(client, `
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, reverses_id, reverse_reason, account_id, category,
          client_request_id, created_at, created_by, created_by_kind
        ) VALUES ($1, 'reversal: pago solidario', 3, 'USD', $2, '2026-07-23', 'paid', now(),
          $3, 'Mismatched payout correction', $4, 'solidarity_payout', $5, now(), $6, 'member')
      `, [fixture.orgId, fixture.memberId, liveExpenseId, fixture.groupAccountId, randomUUID(), fixture.actorId], {
        code: "23514",
        message: "collection_payout_reversal_mismatch",
      });
      const reversalRequestId = randomUUID();
      await client.query(`
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, reverses_id, reverse_reason, account_id, category,
          client_request_id, created_at, created_by, created_by_kind
        ) VALUES ($1, 'reversal: pago solidario', 2, 'USD', $2, '2026-07-23', 'paid', now(),
          $3, 'Governed payout correction', $4, 'solidarity_payout', $5, now(), $6, 'member')
      `, [fixture.orgId, fixture.memberId, liveExpenseId, fixture.groupAccountId, reversalRequestId, fixture.actorId]);
      await expectRejected(client, `
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, reverses_id, reverse_reason, account_id, category,
          client_request_id, created_at, created_by, created_by_kind
        ) VALUES ($1, 'reversal: pago solidario', 2, 'USD', $2, '2026-07-24', 'paid', now(),
          $3, 'Second payout correction', $4, 'solidarity_payout', $5, now(), $6, 'member')
      `, [fixture.orgId, fixture.memberId, liveExpenseId, fixture.groupAccountId, randomUUID(), fixture.actorId], {
        code: "23505",
        message: "collection_payout_already_reversed",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects NULL discriminators and nonpositive regularization amounts", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const collectionId = await insertCollection(client, fixture);
      const lineId = await insertLine(client, fixture, collectionId, {
        accountId: fixture.personalAccountId,
        status: "pending",
      });
      const sql = `
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, $4, 'USD', '2026-07-22', 'regularization', $5, $6, now(), $7)
      `;
      await expectRejected(client, sql, [
        fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, 1, null, lineId, fixture.actorId,
      ], { code: "23514", message: "regularization_source_unavailable" });
      for (const amount of [0, -1]) {
        await expectRejected(client, sql, [
          fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, amount,
          "extraordinary_collection", lineId, fixture.actorId,
        ], { code: "23514", message: "regularization_amount_invalid" });
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects cross-tenant members and accounts at every primary reference", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const foreignMemberId = randomUUID();
      await client.query(`
        INSERT INTO member (
          id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind
        ) VALUES ($1, $2, 'Foreign member', '2026-01-01', 'aportante', 'activo', 0,
          now(), $3, 'member')
      `, [foreignMemberId, fixture.otherOrgId, fixture.actorId]);

      await expectRejected(client, `
        INSERT INTO extraordinary_collection (
          org_id, kind, purpose, beneficiary_member_id, status, opened_on, created_at, created_by
        ) VALUES ($1, 'solidarity', 'Foreign beneficiary', $2, 'open', '2026-07-21', now(), $3)
      `, [fixture.orgId, foreignMemberId, fixture.actorId], {
        code: "23503", message: "fk_extraordinary_collection_beneficiary_org",
      });

      const collectionId = await insertCollection(client, fixture);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 1, $4, 'regularized', '2026-07-21', now(), $5)
      `, [fixture.orgId, collectionId, foreignMemberId, fixture.groupAccountId, fixture.actorId], {
        code: "23503", message: "fk_extraordinary_collection_line_member_org",
      });
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 1, $4, 'regularized', '2026-07-21', now(), $5)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.otherGroupAccountId, fixture.actorId], {
        code: "23503", message: "fk_extraordinary_collection_line_account_org",
      });
      await expectRejected(client, `
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, 'Foreign beneficiary expense', 1, 'USD', $2, '2026-07-22',
          'paid', now(), $3, 'solidarity_payout', now(), $4, 'member')
      `, [fixture.orgId, foreignMemberId, fixture.groupAccountId, fixture.actorId], {
        code: "23503", message: "fk_expense_beneficiary_org",
      });

      const foreignCollectionId = randomUUID();
      const foreignExpenseId = randomUUID();
      await expectRejected(client, `
        DO $foreign_payout$
        BEGIN
          INSERT INTO extraordinary_collection (
            id, org_id, kind, purpose, beneficiary_member_id, status, opened_on, created_at, created_by
          ) VALUES (
            '${foreignCollectionId}'::uuid, '${fixture.orgId}'::uuid, 'solidarity',
            'Foreign payout match', '${foreignMemberId}'::uuid, 'open', '2026-07-21',
            now(), '${fixture.actorId}'::uuid
          );
          INSERT INTO extraordinary_collection_line (
            org_id, collection_id, member_id, amount, account_id, reconciliation_status,
            dated_on, created_at, created_by
          ) VALUES (
            '${fixture.orgId}'::uuid, '${foreignCollectionId}'::uuid, '${fixture.memberId}'::uuid,
            10, '${fixture.groupAccountId}'::uuid, 'regularized', '2026-07-21',
            now(), '${fixture.actorId}'::uuid
          );
          UPDATE extraordinary_collection SET status = 'collecting'
            WHERE id = '${foreignCollectionId}'::uuid;
          INSERT INTO expense (
            id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
            status, recorded_at, account_id, category, created_at, created_by, created_by_kind
          ) VALUES (
            '${foreignExpenseId}'::uuid, '${fixture.orgId}'::uuid, 'Foreign matching payout',
            4, 'USD', '${foreignMemberId}'::uuid, '2026-07-22', 'paid', now(),
            '${fixture.groupAccountId}'::uuid, 'solidarity_payout', now(),
            '${fixture.actorId}'::uuid, 'member'
          );
          UPDATE extraordinary_collection
            SET status = 'paid_out', paid_out_expense_id = '${foreignExpenseId}'::uuid
            WHERE id = '${foreignCollectionId}'::uuid;
        END;
        $foreign_payout$;
      `, [], { code: "23503", message: "fk_extraordinary_collection_beneficiary_org" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("rejects PostgreSQL numeric NaN at every collection money boundary", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection (
          org_id, kind, purpose, target_amount, status, opened_on, created_at, created_by
        ) VALUES ($1, 'solidarity', 'NaN target', 'NaN'::numeric, 'open', '2026-07-21', now(), $2)
      `, [fixture.orgId, fixture.actorId], {
        code: "23514", message: "ck_extraordinary_collection_target_nonnegative",
      });

      const collectionId = await insertCollection(client, fixture);
      await expectRejected(client, `
        INSERT INTO extraordinary_collection_line (
          org_id, collection_id, member_id, amount, account_id, reconciliation_status,
          dated_on, created_at, created_by
        ) VALUES ($1, $2, $3, 'NaN'::numeric, $4, 'regularized', '2026-07-21', now(), $5)
      `, [fixture.orgId, collectionId, fixture.memberId, fixture.groupAccountId, fixture.actorId], {
        code: "23514", message: "ck_extraordinary_collection_line_amount_nonnegative",
      });

      const pendingLineId = await insertLine(client, fixture, collectionId, {
        accountId: fixture.personalAccountId, status: "pending",
      });
      await expectRejected(client, `
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, regularizes_kind, regularizes_id, created_at, created_by
        ) VALUES ($1, $2, $3, 'NaN'::numeric, 'USD', '2026-07-22', 'regularization',
          'extraordinary_collection', $4, now(), $5)
      `, [fixture.orgId, fixture.personalAccountId, fixture.groupAccountId, pendingLineId, fixture.actorId], {
        code: "23514", message: "regularization_amount_invalid",
      });
      await expectRejected(client, `
        INSERT INTO expense (
          org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
          account_id, category, created_at, created_by, created_by_kind
        ) VALUES ($1, 'NaN payout', 'NaN'::numeric, 'USD', '2026-07-22', 'paid', now(),
          $2, 'solidarity_payout', now(), $3, 'member')
      `, [fixture.orgId, fixture.groupAccountId, fixture.actorId], {
        code: "23514", message: "ck_expense_amount_finite",
      });

      const recognitionId = await insertCollection(client, fixture, { kind: "treasurer_recognition" });
      await insertLine(client, fixture, recognitionId, { amount: 10 });
      await client.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [recognitionId]);
      await client.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [recognitionId]);
      await expectRejected(client, `
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 'NaN'::numeric,
            disposition = 'retained', disposition_motive = 'Assembly vote'
        WHERE id = $1
      `, [recognitionId], { code: "23514", message: "collection_money_not_finite" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
      await pool.end();
    }
  });

  runIfDatabase("serializes a concurrent tenant transfer before collection close", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const transferClient = await pool.connect();
    const closeClient = await pool.connect();
    try {
      await transferClient.query("BEGIN");
      const fixture = await seedFixture(transferClient);
      const collectionId = await insertCollection(transferClient, fixture, { kind: "treasurer_recognition" });
      await insertLine(transferClient, fixture, collectionId, { amount: 10 });
      await transferClient.query("UPDATE extraordinary_collection SET status = 'collecting' WHERE id = $1", [collectionId]);
      await transferClient.query("UPDATE extraordinary_collection SET status = 'paid_out' WHERE id = $1", [collectionId]);
      await transferClient.query("COMMIT");

      await transferClient.query("BEGIN");
      await transferClient.query(`
        INSERT INTO transfer (
          org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
          purpose, created_at, created_by
        ) VALUES ($1, $2, $3, 1, 'USD', '2026-07-22', 'transfer', now(), $4)
      `, [fixture.orgId, fixture.groupAccountId, fixture.personalAccountId, fixture.actorId]);

      await closeClient.query("BEGIN");
      const closePid = (await closeClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      const closePromise = closeClient.query(`
        UPDATE extraordinary_collection
        SET status = 'closed', surplus_amount = 10, disposition = 'retained',
            disposition_motive = 'Serialized assembly vote'
        WHERE id = $1
      `, [collectionId]);

      let waitEvent: { wait_event_type: string | null; wait_event: string | null } | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = await transferClient.query(`
          SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1
        `, [closePid]);
        waitEvent = activity.rows[0];
        if (waitEvent?.wait_event_type === "Lock" && waitEvent.wait_event === "advisory") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waitEvent).toEqual({ wait_event_type: "Lock", wait_event: "advisory" });

      await transferClient.query("COMMIT");
      await closePromise;
      await closeClient.query("COMMIT");
      const result = await closeClient.query("SELECT status FROM extraordinary_collection WHERE id = $1", [collectionId]);
      expect(result.rows).toEqual([{ status: "closed" }]);
    } finally {
      await transferClient.query("ROLLBACK").catch(() => undefined);
      await closeClient.query("ROLLBACK").catch(() => undefined);
      transferClient.release();
      closeClient.release();
      await pool.end();
    }
  });
});
