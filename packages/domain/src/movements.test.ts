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
  contribution,
  contributionCycle,
  expense,
  loan,
  member,
  organization,
  projectedLiquidity,
  repayment,
  slipPhoto,
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
let createLiquidityService: typeof import("./liquidity")["createLiquidityService"];

describe("movement invariants", () => {
  beforeAll(async () => {
    ({
      assertExpenseCategory,
      assertTransferAccounts,
      createMovementService,
      parsePositiveMoney4,
      transferAccountDeltas,
      transferFundDelta,
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
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, orgId));
        await tx.delete(repayment).where(eq(repayment.orgId, orgId));
        await tx.delete(contribution).where(eq(contribution.orgId, orgId));
        await tx.delete(loan).where(eq(loan.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(contributionCycle).where(eq(contributionCycle.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
    await db.execute(sql`REFRESH MATERIALIZED VIEW mv_available_capital`);
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
  }) {
    const [row] = await db.insert(account).values({
      orgId: input.orgId ?? ORG_A,
      name: input.name,
      type: input.isGroupFund === false ? "external" : "group_bank",
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
    })]);
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
