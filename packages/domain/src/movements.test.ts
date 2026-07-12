import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, inArray, sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  account,
  alert,
  auditLogEntry,
  availableCapital,
  cashBalances,
  contribution,
  contributionCycle,
  expense,
  loan,
  member,
  organization,
  groupConfig,
  periodClose,
  projectedLiquidity,
  reconciliationCycle,
  repayment,
  slipPhoto,
  statementArchive,
  statementArtifactEvent,
  transfer,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // beforeAll reports the required configuration explicitly.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR_ID = randomUUID();
const NOW = new Date("2026-07-11T16:00:00.000Z");
const triggerSuffix = randomUUID().replaceAll("-", "").slice(0, 16);
const triggerName = `reject_movement_audit_${triggerSuffix}`;
const functionName = `${triggerName}_fn`;

let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createMovementService: typeof import("./movements")["createMovementService"];
let assertExpenseCategory: typeof import("./movements")["assertExpenseCategory"];
let parsePositiveMoney4: typeof import("./movements")["parsePositiveMoney4"];
let assertTransferAccounts: typeof import("./movements")["assertTransferAccounts"];
let transferAccountDeltas: typeof import("./movements")["transferAccountDeltas"];
let transferFundDelta: typeof import("./movements")["transferFundDelta"];
let pendingDepositFundDelta: typeof import("./movements")["pendingDepositFundDelta"];
let shouldMarkRegularized: typeof import("./movements")["shouldMarkRegularized"];
let createLiquidityService: typeof import("./liquidity")["createLiquidityService"];
let createLedgerService: typeof import("./ledger")["createLedgerService"];
let createReportingService: typeof import("./reporting")["createReportingService"];
let canonicalJson: typeof import("./reporting")["canonicalJson"];
let sha256Hex: typeof import("./reporting")["sha256Hex"];

describe("movement invariants", () => {
  beforeAll(async () => {
    ({
      assertExpenseCategory,
      assertTransferAccounts,
      createMovementService,
      parsePositiveMoney4,
      transferAccountDeltas,
      transferFundDelta,
      pendingDepositFundDelta,
      shouldMarkRegularized,
    } = await import("./movements"));
  });

  it("accepts exactly the BR-13 expense catalogue", () => {
    const categories = [
      "bank_fee",
      "supplies",
      "shared_expense",
      "operating",
      "solidarity_payout",
      "treasurer_comp_payout",
    ] as const;

    for (const category of categories) {
      expect(assertExpenseCategory(category)).toBe(category);
    }
    expect(() => assertExpenseCategory("")).toThrow("movement_category_required");
    expect(() => assertExpenseCategory("bank-fee")).toThrow("movement_category_invalid");
    expect(() => assertExpenseCategory("BANK_FEE")).toThrow("movement_category_invalid");
  });

  it.each([
    ["1", "1.0000"],
    ["1.2", "1.2000"],
    ["1.2345", "1.2345"],
    ["12,34", "12.3400"],
    ["1234,56", "1234.5600"],
  ])("normalizes positive decimal money %s to deterministic money4", (input, expected) => {
    expect(parsePositiveMoney4(input)).toBe(expected);
  });

  it.each(["", "0", "0.0000", "-1", "+1", "1e2", "1.00001", "1,00001", "1 000,00", "NaN"])(
    "rejects non-positive or non-decimal money %s",
    (input) => expect(() => parsePositiveMoney4(input)).toThrow("movement_amount_invalid"),
  );

  it("preserves every generated positive numeric(18,4) value exactly", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 999_999_999_999_999_999n }),
      (units) => {
      const whole = units / 10_000n;
      const fraction = String(units % 10_000n).padStart(4, "0");
      expect(parsePositiveMoney4(`${whole}.${fraction}`)).toBe(`${whole}.${fraction}`);
      },
    ), { seed: 92, numRuns: 1_000 });
  });

  it("accepts the numeric(18,4) ceiling and rejects larger or unbounded inputs", () => {
    expect(parsePositiveMoney4("99999999999999.9999")).toBe("99999999999999.9999");
    expect(() => parsePositiveMoney4("100000000000000.0000")).toThrow("movement_amount_invalid");
    expect(() => parsePositiveMoney4(`${"9".repeat(100_000)}.0000`)).toThrow("movement_amount_invalid");
  });

  it("enforces active same-org group accounts and a zero total transfer delta", () => {
    const from: { id: string; orgId: string; isGroupFund: boolean; status: "active" | "archived" } = {
      id: "from", orgId: "org", isGroupFund: true, status: "active",
    };
    const to: { id: string; orgId: string; isGroupFund: boolean; status: "active" | "archived" } = {
      id: "to", orgId: "org", isGroupFund: true, status: "active",
    };
    expect(assertTransferAccounts({ from, to })).toEqual({ from, to });
    expect(() => assertTransferAccounts({ from, to: { ...to, id: "from" } }))
      .toThrow("transfer_accounts_must_differ");
    expect(() => assertTransferAccounts({ from, to: { ...to, orgId: "other" } }))
      .toThrow("transfer_accounts_same_org_required");
    expect(() => assertTransferAccounts({ from: { ...from, status: "archived" }, to }))
      .toThrow("transfer_account_unavailable");
    expect(() => assertTransferAccounts({ from, to: { ...to, isGroupFund: false } }))
      .toThrow("transfer_group_accounts_required");
    expect(transferFundDelta({ from, to, amount: "987654321.1234" })).toBe("0.0000");
    expect(transferAccountDeltas({ from, to, amount: "25.2500" })).toEqual({
      from: "-25.2500",
      to: "25.2500",
    });
  });

  it("keeps pending deposits outside the fund until regularizing coverage is complete", () => {
    expect(pendingDepositFundDelta({ reconciliationStatus: "pending", amount: "100.0000" })).toBe("0.0000");
    expect(pendingDepositFundDelta({ reconciliationStatus: "regularized", amount: "100.0000" })).toBe("100.0000");
    expect(shouldMarkRegularized({ sourceAmount: "100.0000", regularizedAmount: "99.9999" })).toBe(false);
    expect(shouldMarkRegularized({ sourceAmount: "100.0000", regularizedAmount: "100.0000" })).toBe(true);
    expect(shouldMarkRegularized({ sourceAmount: "100.0000", regularizedAmount: "120.0000" })).toBe(true);
  });
});

describe("movement service with PostgreSQL", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for movement service integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createMovementService, transferAccountDeltas, transferFundDelta } = await import("./movements"));
    ({ createLiquidityService } = await import("./liquidity"));
    ({ createLedgerService } = await import("./ledger"));
    ({ createReportingService, canonicalJson, sha256Hex } = await import("./reporting"));

    for (const [id, displayName] of [[ORG_A, "Movements test A"], [ORG_B, "Movements test B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: NOW,
        createdBy: ACTOR_ID,
        createdByKind: "system",
      }).onConflictDoUpdate({ target: organization.id, set: { status: "active" } });
    }
  });

  afterEach(async () => {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_log_entry`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
    for (const orgId of [ORG_A, ORG_B]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(alert).where(eq(alert.orgId, orgId));
        await tx.delete(transfer).where(eq(transfer.orgId, orgId));
        await tx.delete(statementArtifactEvent).where(eq(statementArtifactEvent.orgId, orgId));
        await tx.delete(statementArchive).where(eq(statementArchive.orgId, orgId));
        await tx.delete(periodClose).where(eq(periodClose.orgId, orgId));
        await tx.delete(reconciliationCycle).where(eq(reconciliationCycle.orgId, orgId));
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, orgId));
        await tx.delete(repayment).where(eq(repayment.orgId, orgId));
        await tx.delete(contribution).where(eq(contribution.orgId, orgId));
        await tx.delete(loan).where(eq(loan.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(groupConfig).where(eq(groupConfig.orgId, orgId));
        await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_available_capital`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_cash_balances`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_liquidez_proyectada`);
  });

  afterAll(async () => {
    await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
  });

  async function seedAccount(input: {
    orgId?: string;
    name: string;
    isGroupFund?: boolean;
    status?: "active" | "archived";
    type?: "group_bank" | "cash_box" | "treasurer_personal" | "external";
  }) {
    const [row] = await db.insert(account).values({
      orgId: input.orgId ?? ORG_A,
      name: input.name,
      type: input.type ?? (input.isGroupFund === false ? "external" : "group_bank"),
      isGroupFund: input.isGroupFund ?? true,
      status: input.status ?? "active",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      clientRequestId: randomUUID(),
    }).returning();
    if (!row) throw new Error("test_account_not_created");
    return row;
  }

  async function seedInflows(input: { orgId: string; accountId: string; contributionAmount: string; repaymentAmount: string }) {
    const memberId = randomUUID();
    const cycleId = randomUUID();
    const loanId = randomUUID();
    await db.insert(member).values({
      id: memberId,
      orgId: input.orgId,
      displayName: `Balance member ${memberId}`,
      joinedOn: "2026-01-01",
      role: "aportante",
      status: "activo",
      initialSavingsBalance: "0.0000",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    await db.insert(contributionCycle).values({
      id: cycleId,
      orgId: input.orgId,
      cycleLabel: `balance-${cycleId}`,
      kind: "monthly",
      opensOn: "2026-07-01",
      closesOn: "2026-07-31",
      expectedAmountPerMember: "20.0000",
      currencyCode: "USD",
      status: "open",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await db.insert(loan).values({
      id: loanId,
      orgId: input.orgId,
      memberId,
      borrowerKind: "member",
      borrowerMemberId: memberId,
      principalAmount: "100.0000",
      currencyCode: "USD",
      rateValue: "1.0000",
      rateModel: "fixed",
      termPeriods: 1,
      gracePeriods: 0,
      originatedOn: "2026-07-01",
      status: "activo",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await db.execute(sql`
      INSERT INTO contribution (
        org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
        dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES (
        ${input.orgId}, ${cycleId}, ${memberId}, 'regular', 'bank_transfer', ${input.contributionAmount}, 'USD',
        '2026-07-10', ${NOW}, ${input.accountId}, 'regularized', ${NOW}, ${ACTOR_ID}, 'member'
      )
    `);
    await db.execute(sql`
      INSERT INTO repayment (
        org_id, loan_id, member_id, amount, currency_code, applied_to_principal,
        applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id,
        reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES (
        ${input.orgId}, ${loanId}, ${memberId}, ${input.repaymentAmount}, 'USD', ${input.repaymentAmount},
        0, 0, '2026-07-10', ${NOW}, ${input.accountId}, 'regularized', ${NOW}, ${ACTOR_ID}, 'member'
      )
    `);
  }

  async function seedPendingContribution(input: {
    orgId?: string;
    amount?: string;
    accountId?: string;
  } = {}) {
    const orgId = input.orgId ?? ORG_A;
    const sourceAccount = input.accountId
      ? { id: input.accountId }
      : await seedAccount({ orgId, name: `Personal ${randomUUID()}`, isGroupFund: false });
    const memberId = randomUUID();
    const cycleId = randomUUID();
    await db.insert(member).values({
      id: memberId,
      orgId,
      displayName: `Pending member ${memberId}`,
      joinedOn: "2026-01-01",
      role: "aportante",
      status: "activo",
      initialSavingsBalance: "0.0000",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    await db.insert(contributionCycle).values({
      id: cycleId,
      orgId,
      cycleLabel: `pending-${cycleId}`,
      kind: "monthly",
      opensOn: "2026-07-01",
      closesOn: "2026-07-31",
      expectedAmountPerMember: "100.0000",
      currencyCode: "USD",
      status: "open",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO contribution (
        id, org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
        dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES (
        ${id}, ${orgId}, ${cycleId}, ${memberId}, 'regular', 'bank_transfer', ${input.amount ?? "100.0000"}, 'USD',
        '2026-07-10', ${NOW}, ${sourceAccount.id}, 'pending', ${NOW}, ${ACTOR_ID}, 'member'
      )
    `);
    const row = { id, orgId, cycleId, memberId, accountId: sourceAccount.id, amount: input.amount ?? "100.0000" };
    return { row, memberId, sourceAccountId: sourceAccount.id };
  }

  it("lists only active group-fund accounts for the requested tenant", async () => {
    await seedAccount({ name: "Zeta" });
    await seedAccount({ name: "Archived", status: "archived" });
    await seedAccount({ name: "External", isGroupFund: false });
    await seedAccount({ orgId: ORG_B, name: "Hidden" });

    const rows = await createMovementService().listActiveGroupAccounts(ORG_A);

    expect(rows.map((row) => [row.orgId, row.name])).toEqual([[ORG_A, "Zeta"]]);
  });

  it("lists pending deposit extension rows without leaking regularized or foreign contributions", async () => {
    for (const orgId of [ORG_A, ORG_B]) {
      const memberId = randomUUID();
      const cycleId = randomUUID();
      await db.insert(member).values({
        id: memberId,
        orgId,
        displayName: `Pending member ${orgId}`,
        joinedOn: "2026-01-01",
        role: "aportante",
        status: "activo",
        initialSavingsBalance: "0.0000",
        createdAt: NOW,
        createdBy: ACTOR_ID,
        createdByKind: "system",
      });
      await db.insert(contributionCycle).values({
        id: cycleId,
        orgId,
        cycleLabel: "2026-07",
        kind: "monthly",
        opensOn: "2026-07-01",
        closesOn: "2026-07-31",
        expectedAmountPerMember: "20.0000",
        currencyCode: "USD",
        status: "open",
        createdAt: NOW,
        createdBy: ACTOR_ID,
        createdByKind: "member",
      });
      await db.execute(sql`
        INSERT INTO contribution (
          org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
          dated_on, recorded_at, reconciliation_status, created_at, created_by, created_by_kind
        ) VALUES
          (${orgId}, ${cycleId}, ${memberId}, 'regular', 'bank_transfer', 25.0000, 'USD',
           '2026-07-10', ${NOW}, 'pending', ${NOW}, ${ACTOR_ID}, 'member'),
          (${orgId}, ${cycleId}, ${memberId}, 'regular', 'bank_transfer', 30.0000, 'USD',
           '2026-07-11', ${NOW}, 'regularized', ${NOW}, ${ACTOR_ID}, 'member')
      `);
    }

    const rows = await createMovementService().listPendingDeposits(ORG_A);

    expect(rows).toEqual([expect.objectContaining({
      orgId: ORG_A,
      sourceKind: "contribution",
      amount: "25.0000",
      datedOn: "2026-07-10",
      memberName: expect.stringContaining("Pending member"),
    })]);
  });

  it("regularizes only after total non-reversed coverage reaches the pending source amount", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Group target" });

    const partial = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      notes: "Primera parte",
      clientRequestId: randomUUID(),
    });
    expect(partial.regularized).toBe(false);

    const full = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "60.0000",
      datedOn: "2026-07-12",
      notes: "Completa cobertura",
      clientRequestId: randomUUID(),
    });
    expect(full.regularized).toBe(true);

    const [source] = await withTenantTransaction(ORG_A, (tx) => tx.select({ reconciliationStatus: contribution.reconciliationStatus }).from(contribution)
      .where(and(eq(contribution.orgId, ORG_A), eq(contribution.id, pending.row.id))));
    const transfers = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer)
      .where(and(eq(transfer.orgId, ORG_A), eq(transfer.regularizesId, pending.row.id))));
    expect(source?.reconciliationStatus).toBe("regularized");
    expect(transfers.map((row) => [row.fromAccountId, row.toAccountId, row.amount, row.purpose])).toEqual([
      [pending.sourceAccountId, target.id, "40.0000", "regularization"],
      [pending.sourceAccountId, target.id, "60.0000", "regularization"],
    ]);
  });

  it("verifies the archived payload after live renames and backdated movements", async () => {
    const group = await seedAccount({ name: "Archived bank label" });
    await seedInflows({
      orgId: ORG_A,
      accountId: group.id,
      contributionAmount: "10.0000",
      repaymentAmount: "1.0000",
    });
    const payload = {
      kind: "monthly_member",
      orgName: "Archived organization label",
      periodLabel: "Asamblea extraordinaria",
      verificationMovements: [{
        id: "archived-movement",
        kind: "contribution",
        status: "regularized",
        amount: "10.0000",
        datedOn: "2026-07-10",
        accountName: "Archived bank label",
        label: "Aporte regularizado · Archived bank label",
      }],
      sections: [],
    };
    const hash = sha256Hex(canonicalJson(payload));
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.insert(statementArchive).values({
        orgId: ORG_A,
        kind: "monthly_member",
        memberId: null,
        periodLabel: "Asamblea extraordinaria",
        pdfUri: `/statement-archive/public/${hash}.pdf`,
        canonicalPayloadHash: hash,
        canonicalPayload: payload,
        generatedAt: NOW,
        periodCloseId: null,
        yearEndShareOutId: null,
        byteSize: Buffer.byteLength(canonicalJson(payload), "utf8"),
        createdAt: NOW,
        createdByKind: "system",
      });
      await tx.update(account).set({ name: "Renamed live bank" }).where(and(
        eq(account.orgId, ORG_A), eq(account.id, group.id),
      ));
      await tx.update(organization).set({ displayName: "Renamed live organization" }).where(eq(organization.id, ORG_A));
    });
    await seedInflows({
      orgId: ORG_A,
      accountId: group.id,
      contributionAmount: "999.0000",
      repaymentAmount: "999.0000",
    });

    const verified = await createReportingService().verifyStatementHash(hash);

    expect(verified).toEqual({
      matched: true,
      groupName: "Archived organization label",
      generatedAt: NOW.toISOString(),
      movements: payload.verificationMovements,
    });
    expect(sha256Hex(canonicalJson(payload))).toBe(hash);
    await db.update(organization).set({ displayName: "Movements test A" }).where(eq(organization.id, ORG_A));
  });

  it("keeps a legacy null-payload archive verifiable after account renames and backdated movements", async () => {
    const accountRow = await seedAccount({ name: "Legacy archived account" });
    const legacyHash = "b".repeat(64);
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.insert(statementArchive).values({
        orgId: ORG_A,
        kind: "monthly_member",
        memberId: null,
        periodLabel: "Asamblea extraordinaria",
        pdfUri: `/statement-archive/public/${legacyHash}.pdf`,
        canonicalPayloadHash: legacyHash,
        canonicalPayload: null,
        legacyVerificationPayload: {
          legacy: true,
          orgId: ORG_A,
          kind: "monthly_member",
          periodLabel: "Asamblea extraordinaria",
          canonicalPayloadHash: legacyHash,
        },
        generatedAt: NOW,
        periodCloseId: null,
        yearEndShareOutId: null,
        byteSize: 321,
        createdAt: NOW,
        createdByKind: "system",
      });
      await tx.update(account).set({ name: "Renamed after legacy archive" }).where(and(
        eq(account.orgId, ORG_A), eq(account.id, accountRow.id),
      ));
    });
    await seedInflows({
      orgId: ORG_A,
      accountId: accountRow.id,
      contributionAmount: "777.0000",
      repaymentAmount: "333.0000",
    });

    await expect(createReportingService().verifyStatementHash(legacyHash)).resolves.toEqual({
      matched: true,
      groupName: "Archivo historico",
      generatedAt: NOW.toISOString(),
      movements: [],
      legacy: true,
      periodLabel: "Asamblea extraordinaria",
    });
  });

  it("rejects coverage above the remaining amount while allowing an exact 40 plus 60 split", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Coverage cap target" });

    await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      clientRequestId: randomUUID(),
    });
    await expect(service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "100.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    })).rejects.toThrow("regularization_amount_exceeds_remaining");

    const completed = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "60.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });
    expect(completed).toMatchObject({ coverage: "100.0000", remaining: "0.0000", regularized: true });
  });

  it("allows only one concurrent regularization when both commands target the same remaining amount", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Concurrent cap target" });
    const command = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution" as const,
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "100.0000",
      datedOn: "2026-07-12",
    };

    const results = await Promise.allSettled([
      service.regularizePendingDeposit({ ...command, clientRequestId: randomUUID() }),
      service.regularizePendingDeposit({ ...command, clientRequestId: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ message: "regularization_source_already_regularized" }) }),
    ]);
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(and(
      eq(transfer.orgId, ORG_A),
      eq(transfer.regularizesId, pending.row.id),
    )));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe("100.0000");
  });

  it("enforces the cumulative cap for direct SQL and excludes reversed transfers from coverage", async () => {
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Database cap target" });
    const service = createMovementService({ now: () => NOW });
    const partial = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      clientRequestId: randomUUID(),
    });

    await expect(db.execute(sql`
      INSERT INTO transfer (
        org_id, from_account_id, to_account_id, amount, currency_code, dated_on,
        purpose, regularizes_kind, regularizes_id, created_at, created_by
      ) VALUES (
        ${ORG_A}, ${pending.sourceAccountId}, ${target.id}, 100.0000, 'USD', '2026-07-12',
        'regularization', 'contribution', ${pending.row.id}, ${NOW}, ${ACTOR_ID}
      )
    `)).rejects.toThrow("regularization_amount_exceeds_remaining");

    await db.execute(sql.raw("SET session_replication_role = replica"));
    const reversalId = randomUUID();
    await db.insert(transfer).values({
      id: reversalId,
      orgId: ORG_A,
      fromAccountId: target.id,
      toAccountId: pending.sourceAccountId,
      amount: "40.0000",
      currencyCode: "USD",
      datedOn: "2026-07-12",
      purpose: "regularization_reversal",
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      reversesId: partial.transfer.id,
      createdAt: NOW,
      createdBy: ACTOR_ID,
    });
    await db.execute(sql.raw("SET session_replication_role = origin"));

    await expect(service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "100.0000",
      datedOn: "2026-07-13",
      clientRequestId: randomUUID(),
    })).resolves.toMatchObject({ coverage: "100.0000", regularized: true });
  });

  it("derives contribution reconciliation status from the tenant-owned deposit account", async () => {
    const seeded = await seedPendingContribution();
    const groupAccount = await seedAccount({ name: "Derived group account" });
    const foreignAccount = await seedAccount({ orgId: ORG_B, name: "Foreign derived account" });
    const personalId = randomUUID();
    const groupId = randomUUID();

    await db.execute(sql`
      INSERT INTO contribution (
        id, org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
        dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES
        (${personalId}, ${ORG_A}, ${seeded.row.cycleId}, ${seeded.memberId}, 'regular', 'bank_transfer',
         '10.0000', 'USD', '2026-07-13', ${NOW}, ${seeded.sourceAccountId}, 'regularized', ${NOW}, ${ACTOR_ID}, 'member'),
        (${groupId}, ${ORG_A}, ${seeded.row.cycleId}, ${seeded.memberId}, 'regular', 'bank_transfer',
         '11.0000', 'USD', '2026-07-13', ${NOW}, ${groupAccount.id}, 'pending', ${NOW}, ${ACTOR_ID}, 'member')
    `);

    const statuses = await withTenantTransaction(ORG_A, (tx) => tx.select({
      id: contribution.id,
      reconciliationStatus: contribution.reconciliationStatus,
    }).from(contribution).where(inArray(contribution.id, [personalId, groupId])));
    expect(statuses).toEqual(expect.arrayContaining([
      { id: personalId, reconciliationStatus: "pending" },
      { id: groupId, reconciliationStatus: "regularized" },
    ]));

    await expect(db.execute(sql`
      INSERT INTO contribution (
        org_id, cycle_id, member_id, kind, payment_source, amount, currency_code,
        dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind
      ) VALUES (
        ${ORG_A}, ${seeded.row.cycleId}, ${seeded.memberId}, 'regular', 'bank_transfer', '12.0000', 'USD',
        '2026-07-13', ${NOW}, ${foreignAccount.id}, 'regularized', ${NOW}, ${ACTOR_ID}, 'member'
      )
    `)).rejects.toThrow("deposit_account_unavailable");
  });

  it("rejects a direct status flip while regularization coverage is partial", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Partial coverage target" });
    await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "99.9999",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });

    await expect(db.execute(sql`
      UPDATE contribution
      SET reconciliation_status = 'regularized'
      WHERE org_id = ${ORG_A} AND id = ${pending.row.id}
    `))
      .rejects.toThrow("regularization_coverage_incomplete");
  });

  it("persists and fully regularizes repayment deposits through the same guarded path", async () => {
    const personalAccount = await seedAccount({ name: "Repayment personal", isGroupFund: false });
    const groupAccount = await seedAccount({ name: "Repayment group" });
    await seedInflows({
      orgId: ORG_A,
      accountId: personalAccount.id,
      contributionAmount: "1.0000",
      repaymentAmount: "75.0000",
    });
    const [source] = await withTenantTransaction(ORG_A, (tx) => tx.select({
      id: repayment.id,
      reconciliationStatus: repayment.reconciliationStatus,
    }).from(repayment).where(and(
      eq(repayment.orgId, ORG_A),
      eq(repayment.accountId, personalAccount.id),
    )).limit(1));
    expect(source?.reconciliationStatus).toBe("pending");
    if (!source) throw new Error("test_repayment_not_created");

    const service = createMovementService({ now: () => NOW });
    const partial = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "repayment",
      regularizesId: source.id,
      toAccountId: groupAccount.id,
      amount: "25.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });
    expect(partial).toMatchObject({ coverage: "25.0000", regularized: false });

    const completed = await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "repayment",
      regularizesId: source.id,
      toAccountId: groupAccount.id,
      amount: "50.0000",
      datedOn: "2026-07-13",
      clientRequestId: randomUUID(),
    });
    expect(completed).toMatchObject({ coverage: "75.0000", regularized: true });
    const [updated] = await withTenantTransaction(ORG_A, (tx) => tx.select({
      reconciliationStatus: repayment.reconciliationStatus,
    }).from(repayment).where(and(eq(repayment.orgId, ORG_A), eq(repayment.id, source.id))));
    expect(updated?.reconciliationStatus).toBe("regularized");
  });

  it("rejects non-group and cross-tenant regularization targets without transfer, audit, or status flip", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const personalTarget = await seedAccount({ name: "Other personal", isGroupFund: false });
    const foreignTarget = await seedAccount({ orgId: ORG_B, name: "Foreign group" });

    for (const toAccountId of [personalTarget.id, foreignTarget.id]) {
      await expect(service.regularizePendingDeposit({
        orgId: ORG_A,
        actorId: ACTOR_ID,
        regularizesKind: "contribution",
        regularizesId: pending.row.id,
        toAccountId,
        amount: "100.0000",
        datedOn: "2026-07-11",
        clientRequestId: randomUUID(),
      })).rejects.toThrow("regularization_target_unavailable");
    }

    const [source] = await withTenantTransaction(ORG_A, (tx) => tx.select({ reconciliationStatus: contribution.reconciliationStatus }).from(contribution)
      .where(eq(contribution.id, pending.row.id)));
    expect(source?.reconciliationStatus).toBe("pending");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toEqual([]);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A)))).toEqual([]);
  });

  it("replays the original partial outcome after later completion and target archival", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Concurrent target" });
    const clientRequestId = randomUUID();
    const command = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution" as const,
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      notes: "Concurrente",
      clientRequestId,
    };

    const results = await Promise.all([service.regularizePendingDeposit(command), service.regularizePendingDeposit(command)]);
    expect(new Set(results.map((result) => result.transfer.id)).size).toBe(1);
    expect(results).toEqual([
      expect.objectContaining({ coverage: "40.0000", regularized: false }),
      expect.objectContaining({ coverage: "40.0000", regularized: false }),
    ]);

    await service.regularizePendingDeposit({
      ...command,
      amount: "60.0000",
      notes: "Completa despues",
      clientRequestId: randomUUID(),
    });
    await db.update(account).set({ status: "archived" }).where(and(eq(account.orgId, ORG_A), eq(account.id, target.id)));

    await expect(service.regularizePendingDeposit(command)).resolves.toMatchObject({
      transfer: { id: results[0]?.transfer.id },
      coverage: "40.0000",
      regularized: false,
    });
    await expect(service.regularizePendingDeposit({ ...command, amount: "41.0000" }))
      .rejects.toThrow("movement_idempotency_conflict");

    const transfers = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer)
      .where(and(eq(transfer.orgId, ORG_A), eq(transfer.clientRequestId, clientRequestId))));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry)
      .where(and(
        eq(auditLogEntry.orgId, ORG_A),
        eq(auditLogEntry.actionKind, "movement.regularization"),
        eq(auditLogEntry.subjectId, results[0]!.transfer.id),
      )));
    expect(transfers).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("projects only live group-fund inflows and exact regularization transfer coverage", async () => {
    const service = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Projection target" });
    const secondGroup = await seedAccount({ name: "Projection transfer target" });

    expect((await createLiquidityService().getProjection(ORG_A)).poolBalance).toBe("0.0000");
    await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      clientRequestId: randomUUID(),
    });
    expect((await createLiquidityService().getProjection(ORG_A)).poolBalance).toBe("40.0000");
    await service.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "60.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });
    expect((await createLiquidityService().getProjection(ORG_A)).poolBalance).toBe("100.0000");
    await service.recordTransfer({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: target.id,
      toAccountId: secondGroup.id,
      amount: "25.0000",
      datedOn: "2026-07-13",
      clientRequestId: randomUUID(),
    });
    expect((await createLiquidityService().getProjection(ORG_A)).poolBalance).toBe("100.0000");
  });

  it("projects pending and regularization cash effects into the correct bank and cash buckets", async () => {
    const movementService = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    await seedInflows({
      orgId: ORG_A,
      accountId: pending.sourceAccountId,
      contributionAmount: "1.0000",
      repaymentAmount: "50.0000",
    });
    const bank = await seedAccount({ name: "Cash projection bank", type: "group_bank" });
    const cash = await seedAccount({ name: "Cash projection box", type: "cash_box" });
    const readLive = async () => {
      const row = await createLedgerService().getCashBalances(ORG_A);
      return { bankBalance: row.bankBalance, pettyCashBalance: row.pettyCashBalance };
    };

    expect(await readLive()).toEqual({ bankBalance: "0.0000", pettyCashBalance: "0.0000" });
    await movementService.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: bank.id,
      amount: "40.0000",
      datedOn: "2026-07-11",
      clientRequestId: randomUUID(),
    });
    expect(await readLive()).toEqual({ bankBalance: "40.0000", pettyCashBalance: "0.0000" });
    await movementService.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: bank.id,
      amount: "60.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });
    expect(await readLive()).toEqual({ bankBalance: "100.0000", pettyCashBalance: "0.0000" });
    await movementService.recordTransfer({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: bank.id,
      toAccountId: cash.id,
      amount: "25.0000",
      datedOn: "2026-07-13",
      clientRequestId: randomUUID(),
    });
    const afterTransfer = await readLive();
    expect(afterTransfer).toEqual({ bankBalance: "75.0000", pettyCashBalance: "25.0000" });
    expect(Number(afterTransfer.bankBalance) + Number(afterTransfer.pettyCashBalance)).toBe(100);

    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_cash_balances`);
    const [materialized] = await db.select().from(cashBalances).where(eq(cashBalances.orgId, ORG_A));
    expect(materialized).toMatchObject(afterTransfer);
  });

  it("rejects monthly close with pending rows and enables it immediately after the last regularization", async () => {
    const movementService = createMovementService({ now: () => NOW });
    const pending = await seedPendingContribution();
    const target = await seedAccount({ name: "Close target" });
    await db.insert(groupConfig).values({
      orgId: ORG_A,
      version: 1,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
      contributionCycleKind: "monthly",
      contributionAmount: "100.0000",
      currencyCode: "USD",
      loanRateModel: "declining_balance",
      loanRateValue: "1.0000",
      loanRatePeriodUnit: "monthly",
      loanGracePeriods: 0,
      loanToSavingsCapRatio: "3.00",
      interestResolution: "daily",
      repaymentSplitRule: "interest_first",
      paysSavingsInterest: false,
      savingsInterestRate: null,
      yearEndShareOutFormula: "proportional_time_weighted",
      safetyMarginAmount: "0.0000",
      reconciliationToleranceAmount: "0.0000",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      config: {},
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    const { createReconciliationService, repairPendingMonthlyCloseArtifacts } = await import("./reconciliation");
    let artifactPayload: Record<string, any> | undefined;
    let artifactWrites = 0;
    const reconciliationService = createReconciliationService({
      now: () => new Date("2026-08-02T12:00:00.000Z"),
    });
    const recoveryService = createReconciliationService({
      now: () => new Date("2026-08-02T12:01:00.000Z"),
      monthlyCloseArtifactWriter: async () => {
        artifactWrites += 1;
        throw new Error("writer_stopped");
      },
    });
    const reconciliation = await reconciliationService.executeReconciliation({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      cycleId: pending.row.cycleId,
      declaredBankBalance: "100.0000",
    });

    await expect(reconciliationService.closePeriod({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      reconciliationCycleId: reconciliation.id,
    })).rejects.toThrow("period_close_pending_regularizations");
    expect(artifactWrites).toBe(0);
    const rejectionAudits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "period_close.reject"))));
    expect(rejectionAudits).toEqual([
      expect.objectContaining({
        reason: "period_close_pending_regularizations",
        payloadSnapshot: expect.objectContaining({
          pendingIds: [pending.row.id],
        }),
      }),
    ]);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(periodClose).where(eq(periodClose.orgId, ORG_A)))).toEqual([]);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArchive).where(eq(statementArchive.orgId, ORG_A)))).toEqual([]);

    await movementService.regularizePendingDeposit({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      regularizesKind: "contribution",
      regularizesId: pending.row.id,
      toAccountId: target.id,
      amount: "100.0000",
      datedOn: "2026-07-12",
      clientRequestId: randomUUID(),
    });
    const refreshed = await reconciliationService.getMonthlyCloseState(ORG_A);
    expect(refreshed).toMatchObject({ computedPoolBalance: "100.0000", closeAllowed: true });
    const closeInput = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      reconciliationCycleId: reconciliation.id,
    };
    const [firstClose, replayedClose] = await Promise.all([
      reconciliationService.closePeriod(closeInput),
      reconciliationService.closePeriod(closeInput),
    ]);
    expect(firstClose).toMatchObject({ status: "closed", pendingRegularizations: [] });
    expect(replayedClose).toMatchObject({
      status: "closed",
      periodCloseId: firstClose.periodCloseId,
      monthlyCloseStatementId: firstClose.monthlyCloseStatementId,
      canonicalPayloadHash: firstClose.canonicalPayloadHash,
    });
    await expect(createReportingService().listStatementArchive(ORG_A)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstClose.monthlyCloseStatementId, artifactStatus: "pending" }),
    ]));
    expect(artifactWrites).toBe(0);
    await expect(recoveryService.closePeriod(closeInput)).resolves.toMatchObject({ monthlyCloseArtifactStatus: "failed" });
    expect(artifactWrites).toBe(1);
    const repair = await repairPendingMonthlyCloseArtifacts({
      organizationIds: [ORG_A],
      now: () => new Date("2026-08-02T12:02:00.000Z"),
      writer: async (input) => {
        artifactWrites += 1;
        artifactPayload = input.payload;
        await db.update(organization).set({ status: "paused" }).where(eq(organization.id, ORG_A));
        return { pdfUri: `/statement-archive/public/${input.canonicalPayloadHash}.pdf`, byteSize: 1024 };
      },
    });
    expect(repair).toEqual({ scannedOrganizations: 1, attempted: 1, ready: 1, failed: 0 });
    const [pausedOrg] = await db.select({ status: organization.status }).from(organization).where(eq(organization.id, ORG_A));
    expect(pausedOrg?.status).toBe("paused");
    await expect(createReportingService().listStatementArchive(ORG_A)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstClose.monthlyCloseStatementId, artifactStatus: "ready" }),
    ]));
    await db.update(organization).set({ status: "active" }).where(eq(organization.id, ORG_A));
    const [recovered, idempotentRecovery] = await Promise.all([
      recoveryService.closePeriod(closeInput),
      recoveryService.closePeriod(closeInput),
    ]);
    expect(recovered.monthlyCloseArtifactStatus).toBe("ready");
    expect(idempotentRecovery.monthlyCloseArtifactStatus).toBe("ready");
    expect(artifactWrites).toBe(2);
    const artifactEvents = await withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArtifactEvent)
      .where(and(eq(statementArtifactEvent.orgId, ORG_A), eq(statementArtifactEvent.statementArchiveId, firstClose.monthlyCloseStatementId!))));
    expect(artifactEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "pending", attemptNumber: 1, byteSize: null }),
      expect.objectContaining({ status: "failed", attemptNumber: 2, errorCode: "writer_stopped" }),
      expect.objectContaining({ status: "ready", byteSize: 1024 }),
    ]));
    const closeAudits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id })
      .from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "period_close.create"))));
    expect(closeAudits).toHaveLength(1);
    expect(artifactPayload?.movementSummary).toEqual({
      bankFees: "0.0000",
      supplies: "0.0000",
      sharedExpenses: "0.0000",
      operatingExpenses: "0.0000",
      transfers: "100.0000",
      netFundBalance: "100.0000",
      pendingRegularizations: 0,
      pendingAssertion: "cero movimientos pendientes de regularizar",
    });
    expect(artifactPayload?.ledgerEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "contribution", amount: "100.0000" }),
      expect.objectContaining({ kind: "transfer", amount: "100.0000", note: "regularization" }),
    ]));
  });

  it("repairs paused and archived tenants while isolating lifecycle and tenant failures", async () => {
    const { repairPendingMonthlyCloseArtifacts } = await import("./reconciliation");
    const seedArtifact = async (input: { orgId: string; marker: string; validHash: boolean }) => {
      const payload = { kind: "monthly_close", orgId: input.orgId, marker: input.marker };
      const hash = input.validHash ? sha256Hex(canonicalJson(payload)) : "0".repeat(64);
      return withTenantTransaction(input.orgId, async (tx) => {
        const [archive] = await tx.insert(statementArchive).values({
          orgId: input.orgId,
          kind: "monthly_close",
          memberId: null,
          periodLabel: input.marker,
          pdfUri: `/statement-archive/public/${hash}.pdf`,
          canonicalPayloadHash: hash,
          canonicalPayload: payload,
          legacyVerificationPayload: null,
          generatedAt: NOW,
          periodCloseId: null,
          yearEndShareOutId: null,
          byteSize: 0,
          createdAt: NOW,
          createdByKind: "system",
        }).returning();
        await tx.insert(statementArtifactEvent).values({
          orgId: input.orgId,
          statementArchiveId: archive!.id,
          status: "pending",
          attemptNumber: 1,
          byteSize: null,
          errorCode: null,
          attemptedAt: NOW,
          createdAt: NOW,
        });
        return archive!;
      });
    };
    const writer = async (input: { canonicalPayloadHash: string }) => ({
      pdfUri: `/statement-archive/public/${input.canonicalPayloadHash}.pdf`,
      byteSize: 2048,
    });

    const pausedArchive = await seedArtifact({ orgId: ORG_A, marker: "paused-repair", validHash: true });
    await db.update(organization).set({ status: "paused" }).where(eq(organization.id, ORG_A));
    await expect(repairPendingMonthlyCloseArtifacts({
      organizationIds: [ORG_A],
      now: () => new Date("2026-08-03T12:00:00.000Z"),
      writer,
    })).resolves.toEqual({ scannedOrganizations: 1, attempted: 1, ready: 1, failed: 0 });
    await expect(withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArtifactEvent).where(and(
      eq(statementArtifactEvent.statementArchiveId, pausedArchive.id),
      eq(statementArtifactEvent.status, "ready"),
    )))).resolves.toHaveLength(1);

    const corruptArchive = await seedArtifact({ orgId: ORG_A, marker: "corrupt-lifecycle", validHash: false });
    const archivedArchive = await seedArtifact({ orgId: ORG_B, marker: "archived-repair", validHash: true });
    await db.update(organization).set({ status: "archived" }).where(eq(organization.id, ORG_B));
    await expect(repairPendingMonthlyCloseArtifacts({
      organizationIds: [ORG_A, ORG_B],
      now: () => new Date("2026-08-03T12:05:00.000Z"),
      writer,
    })).resolves.toEqual({ scannedOrganizations: 2, attempted: 1, ready: 1, failed: 1 });
    await expect(withTenantTransaction(ORG_B, (tx) => tx.select().from(statementArtifactEvent).where(and(
      eq(statementArtifactEvent.statementArchiveId, archivedArchive.id),
      eq(statementArtifactEvent.status, "ready"),
    )))).resolves.toHaveLength(1);
    await expect(withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArtifactEvent).where(
      and(
        eq(statementArtifactEvent.orgId, ORG_A),
        eq(statementArtifactEvent.statementArchiveId, archivedArchive.id),
      ),
    ))).resolves.toEqual([]);
    await expect(withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArtifactEvent).where(and(
      eq(statementArtifactEvent.statementArchiveId, corruptArchive.id),
      eq(statementArtifactEvent.status, "ready"),
    )))).resolves.toEqual([]);

    await db.update(organization).set({ status: "active" }).where(inArray(organization.id, [ORG_A, ORG_B]));
  });

  it("skips a ready legacy archive without blocking a pending artifact in the same tenant", async () => {
    const { repairPendingMonthlyCloseArtifacts } = await import("./reconciliation");
    const pendingPayload = { kind: "monthly_close", orgId: ORG_A, marker: "pending-after-legacy" };
    const pendingHash = sha256Hex(canonicalJson(pendingPayload));
    const legacyHash = "e".repeat(64);
    const [legacyArchive, pendingArchive] = await withTenantTransaction(ORG_A, async (tx) => {
      const [legacy] = await tx.insert(statementArchive).values({
        orgId: ORG_A,
        kind: "monthly_close",
        memberId: null,
        periodLabel: "legacy-ready",
        pdfUri: `/statement-archive/public/${legacyHash}.pdf`,
        canonicalPayloadHash: legacyHash,
        canonicalPayload: null,
        legacyVerificationPayload: { legacy: true },
        generatedAt: NOW,
        periodCloseId: null,
        yearEndShareOutId: null,
        byteSize: 321,
        createdAt: NOW,
        createdByKind: "system",
      }).returning();
      const [pending] = await tx.insert(statementArchive).values({
        orgId: ORG_A,
        kind: "monthly_close",
        memberId: null,
        periodLabel: "pending-after-legacy",
        pdfUri: `/statement-archive/public/${pendingHash}.pdf`,
        canonicalPayloadHash: pendingHash,
        canonicalPayload: pendingPayload,
        legacyVerificationPayload: null,
        generatedAt: NOW,
        periodCloseId: null,
        yearEndShareOutId: null,
        byteSize: 0,
        createdAt: NOW,
        createdByKind: "system",
      }).returning();
      return [legacy!, pending!];
    });
    const writtenMarkers: string[] = [];

    await expect(repairPendingMonthlyCloseArtifacts({
      organizationIds: [ORG_A],
      now: () => new Date("2026-08-03T13:00:00.000Z"),
      writer: async (artifact) => {
        writtenMarkers.push(String((artifact.payload as { marker?: string }).marker));
        return {
          pdfUri: `/statement-archive/public/${artifact.canonicalPayloadHash}.pdf`,
          byteSize: 4096,
        };
      },
    })).resolves.toEqual({ scannedOrganizations: 1, attempted: 1, ready: 1, failed: 0 });

    expect(writtenMarkers).toEqual(["pending-after-legacy"]);
    const events = await withTenantTransaction(ORG_A, (tx) => tx.select().from(statementArtifactEvent).where(
      eq(statementArtifactEvent.orgId, ORG_A),
    ));
    expect(events.filter((event) => event.statementArchiveId === legacyArchive.id)).toEqual([]);
    expect(events.filter((event) => event.statementArchiveId === pendingArchive.id)).toEqual([
      expect.objectContaining({ status: "pending", attemptNumber: 1 }),
      expect.objectContaining({ status: "ready", attemptNumber: 1, byteSize: 4096 }),
    ]);
  });

  it("requires an active group account and rejects missing, archived, non-group, and cross-tenant selections without writes", async () => {
    const service = createMovementService({ now: () => NOW });
    const request = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: randomUUID(),
      category: "bank_fee" as const,
      amount: "10.00",
      datedOn: "2026-07-11",
      notes: "Comisión",
      clientRequestId: randomUUID(),
    };
    await expect(service.recordExpense(request)).rejects.toThrow("movement_group_account_required");

    const valid = await seedAccount({ name: "Valid" });
    const archived = await seedAccount({ name: "Archived", status: "archived" });
    const external = await seedAccount({ name: "External", isGroupFund: false });
    const foreign = await seedAccount({ orgId: ORG_B, name: "Foreign" });
    for (const accountId of [randomUUID(), archived.id, external.id, foreign.id]) {
      await expect(service.recordExpense({ ...request, accountId, clientRequestId: randomUUID() }))
        .rejects.toThrow("movement_account_unavailable");
    }

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: expense.id }).from(expense)
      .where(eq(expense.orgId, ORG_A)));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "movement.expense"))));
    expect(valid.status).toBe("active");
    expect(rows).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("records a paid categorized USD expense and audit once for an idempotent replay", async () => {
    const selected = await seedAccount({ name: "Banco" });
    const clientRequestId = randomUUID();
    const input = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "supplies" as const,
      amount: "12,3456",
      datedOn: "2026-07-10",
      notes: " Papel y tintas ",
      clientRequestId,
    };

    const first = await createMovementService({ now: () => NOW }).recordExpense(input);
    const replay = await createMovementService({ now: () => NOW }).recordExpense(input);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      orgId: ORG_A,
      accountId: selected.id,
      category: "supplies",
      amount: "12.3456",
      currencyCode: "USD",
      incurredOn: "2026-07-10",
      status: "paid",
      purpose: "supplies",
      notes: "Papel y tintas",
      clientRequestId,
      slipPhotoId: null,
    });
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense)
      .where(and(eq(expense.orgId, ORG_A), eq(expense.clientRequestId, clientRequestId))));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({
      actionKind: auditLogEntry.actionKind,
      subjectId: auditLogEntry.subjectId,
      payload: auditLogEntry.payloadSnapshot,
    }).from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "movement.expense"),
    )));
    expect(rows).toHaveLength(1);
    expect(audits).toEqual([{
      actionKind: "movement.expense",
      subjectId: first.id,
      payload: expect.objectContaining({ notes: "Papel y tintas", clientRequestId }),
    }]);
  });

  it("treats absent notes and category-like notes as different idempotency commands", async () => {
    const selected = await seedAccount({ name: "Notes replay source" });
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "supplies" as const,
      amount: "8.0000",
      datedOn: "2026-07-11",
      clientRequestId: randomUUID(),
    };
    const service = createMovementService({ now: () => NOW });

    await service.recordExpense(base);

    await expect(service.recordExpense({ ...base, notes: "supplies" }))
      .rejects.toThrow("movement_idempotency_conflict");
  });

  it("rejects an expense replay when any canonical command field differs", async () => {
    const selected = await seedAccount({ name: "Expense replay source" });
    const other = await seedAccount({ name: "Expense replay other" });
    const clientRequestId = randomUUID();
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "supplies" as const,
      amount: "15.2500",
      datedOn: "2026-07-11",
      notes: "  Canonical note  ",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });
    await service.recordExpense(base);
    const mutations = [
      { field: "actorId", command: { ...base, actorId: randomUUID() } },
      { field: "accountId", command: { ...base, accountId: other.id } },
      { field: "category", command: { ...base, category: "operating" as const } },
      { field: "amount", command: { ...base, amount: "15.2501" } },
      { field: "datedOn", command: { ...base, datedOn: "2026-07-10" } },
      { field: "notes", command: { ...base, notes: "Different note" } },
    ];
    for (const mutation of mutations) {
      await expect(service.recordExpense(mutation.command), mutation.field)
        .rejects.toThrow("movement_idempotency_conflict");
    }
    await expect(service.recordExpense({ ...base, notes: "Canonical note" }))
      .resolves.toMatchObject({ clientRequestId });
  });

  it("resolves concurrent expense inserts only when the canonical commands are equal", async () => {
    const selected = await seedAccount({ name: "Concurrent expense" });
    const clientRequestId = randomUUID();
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "bank_fee" as const,
      amount: "9.5000",
      datedOn: "2026-07-11",
      notes: "Concurrent",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });
    const results = await Promise.allSettled([
      service.recordExpense(base),
      service.recordExpense({ ...base, amount: "9.5001" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ message: "movement_idempotency_conflict" }) }),
    ]);
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_A),
      eq(expense.clientRequestId, clientRequestId),
    )));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "movement.expense"),
      eq(auditLogEntry.subjectId, rows[0]?.id ?? randomUUID()),
    )));
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("returns one expense and one audit for concurrent equivalent commands", async () => {
    const selected = await seedAccount({ name: "Equivalent concurrent expense" });
    const clientRequestId = randomUUID();
    const command = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "operating" as const,
      amount: "7.1250",
      datedOn: "2026-07-11",
      notes: "  Same expense  ",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });

    const [first, second] = await Promise.all([
      service.recordExpense(command),
      service.recordExpense({ ...command, notes: "Same expense" }),
    ]);

    expect(second.id).toBe(first.id);
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_A),
      eq(expense.clientRequestId, clientRequestId),
    )));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "movement.expense"),
      eq(auditLogEntry.subjectId, first.id),
    )));
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("rejects cross-kind, already-attached, cross-tenant, and forged existing slip IDs", async () => {
    const selected = await seedAccount({ name: "Slip account" });
    const attachedExpenseId = randomUUID();
    const [crossKind, alreadyAttached, crossTenant] = await db.insert(slipPhoto).values([
      {
        orgId: ORG_A,
        uri: "private/slips/cross-kind.webp",
        mimeType: "image/webp",
        byteSize: 1024,
        contentHash: "a".repeat(64),
        attachedToKind: "contribution",
        attachedToId: randomUUID(),
        uploadedAt: NOW,
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
      {
        orgId: ORG_A,
        uri: "private/slips/already-attached.webp",
        mimeType: "image/webp",
        byteSize: 1024,
        contentHash: "b".repeat(64),
        attachedToKind: "expense",
        attachedToId: attachedExpenseId,
        uploadedAt: NOW,
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
      {
        orgId: ORG_B,
        uri: "private/slips/cross-tenant.webp",
        mimeType: "image/webp",
        byteSize: 1024,
        contentHash: "c".repeat(64),
        attachedToKind: "contribution",
        attachedToId: randomUUID(),
        uploadedAt: NOW,
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
    ]).returning();
    if (!crossKind || !alreadyAttached || !crossTenant) throw new Error("test_slips_not_created");
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.insert(expense).values({
        id: attachedExpenseId,
        orgId: ORG_A,
        purpose: "supplies",
        notes: null,
        amount: "1.0000",
        currencyCode: "USD",
        incurredOn: "2026-07-11",
        status: "paid",
        recordedAt: NOW,
        accountId: selected.id,
        category: "supplies",
        slipPhotoId: alreadyAttached.id,
        createdAt: NOW,
        createdBy: ACTOR_ID,
        createdByKind: "member",
      });
    });
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "bank_fee" as const,
      amount: "2.00",
      datedOn: "2026-07-11",
      notes: "Con comprobante",
      clientRequestId: randomUUID(),
    };

    for (const slipPhotoId of [crossKind.id, alreadyAttached.id, crossTenant.id, randomUUID()]) {
      const forgedInput = {
        ...base,
        slipPhotoId,
        clientRequestId: randomUUID(),
      };
      await expect(createMovementService({ now: () => NOW }).recordExpense(forgedInput))
        .rejects.toThrow("movement_slip_unavailable");
    }

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: expense.id }).from(expense)
      .where(eq(expense.orgId, ORG_A)));
    expect(rows).toEqual([{ id: attachedExpenseId }]);
  });

  it("persists validated expense slip metadata atomically and reuses it on idempotent replay", async () => {
    const selected = await seedAccount({ name: "Uploaded slip account" });
    const clientRequestId = randomUUID();
    const input = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "shared_expense" as const,
      amount: "18.7500",
      datedOn: "2026-07-11",
      notes: "Desayuno",
      clientRequestId,
      slipPhoto: {
        uri: `https://private.blob.invalid/expense-slips/${ORG_A}/${clientRequestId}.png`,
        mimeType: "image/png" as const,
        byteSize: 128,
        contentHash: "b".repeat(64),
      },
    };

    const first = await createMovementService({ now: () => NOW }).recordExpense(input);
    const replay = await createMovementService({ now: () => NOW }).recordExpense({
      ...input,
      slipPhoto: {
        ...input.slipPhoto,
        uri: `${input.slipPhoto.uri}.changed`,
      },
    });
    for (const slipPhoto of [
      { ...input.slipPhoto, contentHash: "c".repeat(64) },
      { ...input.slipPhoto, mimeType: "image/webp" as const },
      { ...input.slipPhoto, byteSize: 129 },
    ]) {
      await expect(createMovementService({ now: () => NOW }).recordExpense({ ...input, slipPhoto }))
        .rejects.toThrow("movement_idempotency_conflict");
    }

    expect(replay.id).toBe(first.id);
    expect(first.slipPhotoId).not.toBeNull();
    const slips = await withTenantTransaction(ORG_A, (tx) => tx.select().from(slipPhoto).where(and(
      eq(slipPhoto.orgId, ORG_A),
      eq(slipPhoto.id, first.slipPhotoId ?? randomUUID()),
    )));
    expect(slips).toEqual([expect.objectContaining({
      orgId: ORG_A,
      uri: input.slipPhoto.uri,
      mimeType: "image/png",
      byteSize: 128,
      contentHash: input.slipPhoto.contentHash,
      attachedToKind: "expense",
      attachedToId: first.id,
      uploadedBy: ACTOR_ID,
    })]);
  });

  it.each(["solidarity_payout", "treasurer_comp_payout"] as const)(
    "rejects unsupported direct %s recording so governed payout controls cannot be bypassed",
    async (category) => {
      const selected = await seedAccount({ name: `Governed ${category}` });
      await expect(createMovementService().recordExpense({
        orgId: ORG_A,
        actorId: ACTOR_ID,
        accountId: selected.id,
        category,
        amount: "20.00",
        datedOn: "2026-07-11",
        notes: "No bypass",
        clientRequestId: randomUUID(),
      })).rejects.toThrow("movement_governed_payout_required");

      const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: expense.id }).from(expense)
        .where(eq(expense.orgId, ORG_A)));
      expect(rows).toEqual([]);
    },
  );

  it("rolls back an expense when its audit insert fails", async () => {
    const selected = await seedAccount({ name: "Atomic expense" });
    await installRejectingAuditTrigger("movement.expense");

    await expect(createMovementService({ now: () => NOW }).recordExpense({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "operating",
      amount: "8.00",
      datedOn: "2026-07-11",
      notes: "Rollback",
      clientRequestId: randomUUID(),
      slipPhoto: {
        uri: "https://private.blob.invalid/expense-slips/atomic.png",
        mimeType: "image/png",
        byteSize: 128,
        contentHash: "d".repeat(64),
      },
    })).rejects.toThrow("audit rejected for atomicity test");

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: expense.id }).from(expense)
      .where(eq(expense.orgId, ORG_A)));
    expect(rows).toEqual([]);
    const slips = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: slipPhoto.id }).from(slipPhoto)
      .where(eq(slipPhoto.orgId, ORG_A)));
    expect(slips).toEqual([]);
  });

  it("records a transfer once with purpose transfer, exact account deltas, and zero fund delta", async () => {
    const from = await seedAccount({ name: "Banco" });
    const to = await seedAccount({ name: "Caja" });
    const clientRequestId = randomUUID();
    const input = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "41.125",
      datedOn: "2026-07-11",
      notes: "Reposición de caja",
      clientRequestId,
    };

    const first = await createMovementService({ now: () => NOW }).recordTransfer(input);
    const replay = await createMovementService({ now: () => NOW }).recordTransfer(input);

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      orgId: ORG_A,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "41.1250",
      currencyCode: "USD",
      datedOn: "2026-07-11",
      purpose: "transfer",
      clientRequestId,
    });
    expect(transferAccountDeltas({ from, to, amount: String(first.amount) })).toEqual({
      from: "-41.1250",
      to: "41.1250",
    });
    expect(transferFundDelta({ from, to, amount: String(first.amount) })).toBe("0.0000");
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer)
      .where(and(eq(transfer.orgId, ORG_A), eq(transfer.clientRequestId, clientRequestId))));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ payload: auditLogEntry.payloadSnapshot })
      .from(auditLogEntry).where(and(
        eq(auditLogEntry.orgId, ORG_A),
        eq(auditLogEntry.actionKind, "movement.transfer"),
      )));
    expect(rows).toHaveLength(1);
    expect(audits).toEqual([{ payload: expect.objectContaining({ notes: "Reposición de caja", clientRequestId }) }]);
  });

  it("rejects a transfer replay when any canonical command field differs", async () => {
    const from = await seedAccount({ name: "Transfer replay from" });
    const to = await seedAccount({ name: "Transfer replay to" });
    const other = await seedAccount({ name: "Transfer replay other" });
    const clientRequestId = randomUUID();
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "12.1250",
      datedOn: "2026-07-11",
      notes: "  Canonical transfer  ",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });
    await service.recordTransfer(base);

    const mutations = [
      { field: "actorId", command: { ...base, actorId: randomUUID() } },
      { field: "fromAccountId", command: { ...base, fromAccountId: other.id } },
      { field: "toAccountId", command: { ...base, toAccountId: other.id } },
      { field: "amount", command: { ...base, amount: "12.1251" } },
      { field: "datedOn", command: { ...base, datedOn: "2026-07-10" } },
      { field: "notes", command: { ...base, notes: "Different transfer" } },
    ];
    for (const mutation of mutations) {
      await expect(service.recordTransfer(mutation.command), mutation.field)
        .rejects.toThrow("movement_idempotency_conflict");
    }
    await expect(service.recordTransfer({ ...base, notes: "Canonical transfer" }))
      .resolves.toMatchObject({ clientRequestId });
  });

  it("resolves concurrent transfer inserts only when the canonical commands are equal", async () => {
    const from = await seedAccount({ name: "Concurrent transfer from" });
    const to = await seedAccount({ name: "Concurrent transfer to" });
    const clientRequestId = randomUUID();
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "6.0000",
      datedOn: "2026-07-11",
      notes: "Concurrent transfer",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });
    const results = await Promise.allSettled([
      service.recordTransfer(base),
      service.recordTransfer({ ...base, notes: "Changed concurrently" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ message: "movement_idempotency_conflict" }) }),
    ]);
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(and(
      eq(transfer.orgId, ORG_A),
      eq(transfer.clientRequestId, clientRequestId),
    )));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "movement.transfer"),
      eq(auditLogEntry.subjectId, rows[0]?.id ?? randomUUID()),
    )));
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("returns one transfer and one audit for concurrent equivalent commands", async () => {
    const from = await seedAccount({ name: "Equivalent transfer from" });
    const to = await seedAccount({ name: "Equivalent transfer to" });
    const clientRequestId = randomUUID();
    const command = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "5.5000",
      datedOn: "2026-07-11",
      notes: "  Same transfer  ",
      clientRequestId,
    };
    const service = createMovementService({ now: () => NOW });

    const [first, second] = await Promise.all([
      service.recordTransfer(command),
      service.recordTransfer({ ...command, notes: "Same transfer" }),
    ]);

    expect(second.id).toBe(first.id);
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(and(
      eq(transfer.orgId, ORG_A),
      eq(transfer.clientRequestId, clientRequestId),
    )));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "movement.transfer"),
      eq(auditLogEntry.subjectId, first.id),
    )));
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it("derives tenant-scoped account balances from inflows, expenses, and append-only transfers", async () => {
    const from = await seedAccount({ name: "Balance bank" });
    const to = await seedAccount({ name: "Balance cash" });
    const foreign = await seedAccount({ orgId: ORG_B, name: "Hidden balance" });
    await seedInflows({ orgId: ORG_A, accountId: from.id, contributionAmount: "100.0000", repaymentAmount: "10.0000" });
    await seedInflows({ orgId: ORG_B, accountId: foreign.id, contributionAmount: "500.0000", repaymentAmount: "50.0000" });
    const service = createMovementService({ now: () => NOW });
    await service.recordExpense({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: from.id,
      category: "operating",
      amount: "20.0000",
      datedOn: "2026-07-11",
      notes: "Balance outflow",
      clientRequestId: randomUUID(),
    });
    await db.insert(expense).values({
      orgId: ORG_A,
      purpose: "Planned only",
      amount: "999.0000",
      currencyCode: "USD",
      incurredOn: "2026-07-12",
      status: "planned",
      recordedAt: NOW,
      accountId: from.id,
      category: "operating",
      createdAt: NOW,
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await service.recordTransfer({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "30.0000",
      datedOn: "2026-07-11",
      notes: "Balance transfer",
      clientRequestId: randomUUID(),
    });

    const balances = await service.listActiveGroupAccountBalances(ORG_A);

    expect(balances.map((row) => ({ orgId: row.orgId, name: row.name, balance: row.balance }))).toEqual([
      { orgId: ORG_A, name: "Balance bank", balance: "60.0000" },
      { orgId: ORG_A, name: "Balance cash", balance: "30.0000" },
    ]);
    expect(transferAccountDeltas({ from, to, amount: "30.0000" })).toEqual({ from: "-30.0000", to: "30.0000" });
    expect(transferFundDelta({ from, to, amount: "30.0000" })).toBe("0.0000");
  });

  it("rejects same, missing, archived, non-group, and cross-tenant transfer accounts without rows or audits", async () => {
    const from = await seedAccount({ name: "From" });
    const archived = await seedAccount({ name: "Archived", status: "archived" });
    const external = await seedAccount({ name: "External", isGroupFund: false });
    const foreign = await seedAccount({ orgId: ORG_B, name: "Foreign" });
    const service = createMovementService();
    const base = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: from.id,
      amount: "10.00",
      datedOn: "2026-07-11",
      notes: "Invalid",
      clientRequestId: randomUUID(),
    };

    await expect(service.recordTransfer(base)).rejects.toThrow("transfer_accounts_must_differ");
    for (const toAccountId of [randomUUID(), archived.id, external.id, foreign.id]) {
      await expect(service.recordTransfer({ ...base, toAccountId, clientRequestId: randomUUID() }))
        .rejects.toThrow("transfer_account_unavailable");
    }

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: transfer.id }).from(transfer)
      .where(eq(transfer.orgId, ORG_A)));
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: auditLogEntry.id }).from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, ORG_A), eq(auditLogEntry.actionKind, "movement.transfer"))));
    expect(rows).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("rolls back a transfer when its audit insert fails", async () => {
    const from = await seedAccount({ name: "Atomic from" });
    const to = await seedAccount({ name: "Atomic to" });
    await installRejectingAuditTrigger("movement.transfer");

    await expect(createMovementService({ now: () => NOW }).recordTransfer({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: "5.00",
      datedOn: "2026-07-11",
      notes: "Rollback",
      clientRequestId: randomUUID(),
    })).rejects.toThrow("audit rejected for atomicity test");

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: transfer.id }).from(transfer)
      .where(eq(transfer.orgId, ORG_A)));
    expect(rows).toEqual([]);
  });

  it("reflects a paid expense in live tenant liquidity before the command returns", async () => {
    const selected = await seedAccount({ name: "Projection account" });
    await createMovementService({ now: () => NOW }).recordExpense({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      accountId: selected.id,
      category: "bank_fee",
      amount: "17.1250",
      datedOn: "2026-07-11",
      notes: "Projection regression",
      clientRequestId: randomUUID(),
    });

    const projection = await createLiquidityService().getProjection(ORG_A);

    expect(projection.poolBalance).toBe("-17.1250");
    expect(projection.availableCapital).toBe("-17.1250");
    expect(projection.series).not.toHaveLength(0);
    expect(projection.series.every((row) => row.projectedBalance === "-17.1250")).toBe(true);
  });

  it("does not install or call a movement materialized-view refresh function", async () => {
    const result = await db.execute<{ functionName: string | null }>(sql`
      SELECT to_regprocedure('refresh_movement_read_models()')::text AS "functionName"
    `);
    const [row] = Array.isArray(result) ? result : result.rows;
    expect(row?.functionName).toBeNull();
  });

  async function installRejectingAuditTrigger(actionKind: string) {
    await db.execute(sql.raw(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.org_id = '${ORG_A}'::uuid AND NEW.action_kind = '${actionKind}' THEN
          RAISE EXCEPTION 'audit rejected for atomicity test';
        END IF;
        RETURN NEW;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()
    `));
  }
});
