import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { loadEnvFile } from "node:process";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { del, put } from "@vercel/blob";

import {
  account,
  alert,
  auditLogEntry,
  expense,
  groupConfig,
  member,
  organization,
  slipPhoto,
  transfer,
  treasurerCompensationDisbursement,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // beforeAll reports the required configuration explicitly.
  }
}

const framework = vi.hoisted(() => ({
  redirects: [] as string[],
  revalidated: [] as string[],
}));

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    async getSession() {
      return null;
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => framework.revalidated.push(path),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string): never => {
    framework.redirects.push(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://private.blob.invalid/${pathname}` })),
  del: vi.fn(async () => undefined),
}));

const ORG_ID = randomUUID();
const FOREIGN_ORG_ID = randomUUID();
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let recordExpenseAction: typeof import("./actions")["recordExpenseAction"];
let recordTransferAction: typeof import("./actions")["recordTransferAction"];
let regularizePendingDepositAction: typeof import("./actions")["regularizePendingDepositAction"];
let recordTreasurerCompensationAction: typeof import("./actions")["recordTreasurerCompensationAction"];
let fromAccountId: string;
let toAccountId: string;
let foreignAccountId: string;
const originalBypass = process.env.E2E_AUTH_BYPASS;
const originalOrgId = process.env.AUTH0_ORGANIZATION_DB_ORG_ID;

function expenseForm(clientRequestId = randomUUID()) {
  const formData = new FormData();
  formData.set("accountId", fromAccountId);
  formData.set("category", "supplies");
  formData.set("amount", "10,50");
  formData.set("datedOn", "2026-07-11");
  formData.set("notes", "Papel");
  formData.set("clientRequestId", clientRequestId);
  return formData;
}

function transferForm(clientRequestId = randomUUID()) {
  const formData = new FormData();
  formData.set("fromAccountId", fromAccountId);
  formData.set("toAccountId", toAccountId);
  formData.set("amount", "7.25");
  formData.set("datedOn", "2026-07-11");
  formData.set("notes", "Mover a caja");
  formData.set("clientRequestId", clientRequestId);
  return formData;
}

function compensationForm(clientRequestId = randomUUID(), amount = "30.00") {
  const formData = new FormData();
  formData.set("fiscalYear", "2026");
  formData.set("accountId", fromAccountId);
  formData.set("amount", amount);
  formData.set("datedOn", "2026-07-11");
  formData.set("notes", "Pago aprobado");
  formData.set("clientRequestId", clientRequestId);
  return formData;
}

function onePixelPng(clientType = "image/png") {
  const bytes = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ));
  return new File([bytes], "receipt.bin", { type: clientType });
}

function truncatedPng() {
  return new File([Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00,
  ])], "truncated.png", { type: "image/png" });
}

async function expectRedirect(run: () => Promise<unknown>, path: string) {
  await expect(run()).rejects.toThrow(`NEXT_REDIRECT:${path}`);
}

describe("movement server actions", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for movement action integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    await db.insert(organization).values({
      id: ORG_ID,
      displayName: "Movement action test",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-07-11T12:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    await db.insert(organization).values({
      id: FOREIGN_ORG_ID,
      displayName: "Movement action foreign test",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-07-11T12:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    const rows = await db.insert(account).values([
      {
        orgId: ORG_ID,
        name: "Banco",
        type: "group_bank",
        isGroupFund: true,
        status: "active",
        clientRequestId: randomUUID(),
        createdAt: new Date("2026-07-11T12:00:00.000Z"),
        createdBy: ACTOR_ID,
      },
      {
        orgId: ORG_ID,
        name: "Caja",
        type: "cash_box",
        isGroupFund: true,
        status: "active",
        clientRequestId: randomUUID(),
        createdAt: new Date("2026-07-11T12:00:00.000Z"),
        createdBy: ACTOR_ID,
      },
    ]).returning();
    fromAccountId = rows[0]?.id ?? "";
    toAccountId = rows[1]?.id ?? "";
    const [foreignAccount] = await db.insert(account).values({
      orgId: FOREIGN_ORG_ID,
      name: "Banco extranjero",
      type: "group_bank",
      isGroupFund: true,
      status: "active",
      clientRequestId: randomUUID(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: ACTOR_ID,
    }).returning();
    foreignAccountId = foreignAccount?.id ?? "";
    await db.insert(member).values({
      id: ACTOR_ID,
      orgId: ORG_ID,
      displayName: "Tesorera de prueba",
      joinedOn: "2025-01-01",
      role: "tesorera",
      status: "activo",
      initialSavingsBalance: "0.0000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await db.insert(groupConfig).values({
      orgId: ORG_ID,
      version: 1,
      validFrom: new Date("2025-01-01T00:00:00.000Z"),
      validTo: null,
      contributionCycleKind: "monthly",
      contributionAmount: "20.0000",
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
      yearEndShareOutFormula: "time_weighted",
      safetyMarginAmount: "0.0000",
      reconciliationToleranceAmount: "0.0000",
      lateThresholdDays: 1,
      moraThresholdDays: 5,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
      config: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "member",
    });
    await db.insert(treasurerCompensationDisbursement).values({
      orgId: ORG_ID,
      memberId: ACTOR_ID,
      periodLabel: "2026",
      amount: "55.0000",
      currencyCode: "USD",
      kindAtDisbursement: { kind: "fixed_periodic", nextDueOn: "2026-01-01", period: "yearly" },
      withdrawalId: null,
      disbursedOn: "2026-01-01",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    process.env.AUTH0_ORGANIZATION_DB_ORG_ID = ORG_ID;
    process.env.E2E_AUTH_BYPASS = "1";
    ({
      recordExpenseAction,
      recordTransferAction,
      recordTreasurerCompensationAction,
      regularizePendingDepositAction,
    } = await import("./actions"));
  });

  beforeEach(async () => {
    process.env.E2E_AUTH_BYPASS = "1";
    framework.redirects.length = 0;
    framework.revalidated.length = 0;
    vi.mocked(put).mockClear();
    vi.mocked(del).mockClear();
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(and(
        eq(auditLogEntry.orgId, ORG_ID),
        sql`${auditLogEntry.actionKind} IN ('movement.expense', 'movement.transfer', 'movement.regularization', 'treasurer_compensation.paid')`,
      ));
      await tx.delete(alert).where(eq(alert.orgId, ORG_ID));
      await tx.delete(transfer).where(eq(transfer.orgId, ORG_ID));
      await tx.delete(expense).where(eq(expense.orgId, ORG_ID));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, ORG_ID));
    });
  });

  afterAll(async () => {
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_ID));
      await tx.delete(alert).where(eq(alert.orgId, ORG_ID));
      await tx.delete(transfer).where(eq(transfer.orgId, ORG_ID));
      await tx.delete(expense).where(eq(expense.orgId, ORG_ID));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, ORG_ID));
      await tx.delete(treasurerCompensationDisbursement).where(eq(treasurerCompensationDisbursement.orgId, ORG_ID));
      await tx.delete(groupConfig).where(eq(groupConfig.orgId, ORG_ID));
      await tx.delete(member).where(eq(member.orgId, ORG_ID));
      await tx.delete(account).where(eq(account.orgId, ORG_ID));
    });
    await withTenantTransaction(FOREIGN_ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, FOREIGN_ORG_ID));
      await tx.delete(account).where(eq(account.orgId, FOREIGN_ORG_ID));
    });
    await db.delete(organization).where(eq(organization.id, ORG_ID));
    await db.delete(organization).where(eq(organization.id, FOREIGN_ORG_ID));
    if (originalBypass === undefined) delete process.env.E2E_AUTH_BYPASS;
    else process.env.E2E_AUTH_BYPASS = originalBypass;
    if (originalOrgId === undefined) delete process.env.AUTH0_ORGANIZATION_DB_ORG_ID;
    else process.env.AUTH0_ORGANIZATION_DB_ORG_ID = originalOrgId;
  });

  it("records an expense once and redirects with allowlisted success state", async () => {
    const clientRequestId = randomUUID();
    const path = "/movimientos/registrar?saved=expense&category=supplies&currency=USD&amount=10.5000";

    await expectRedirect(() => recordExpenseAction(expenseForm(clientRequestId)), path);
    await expectRedirect(() => recordExpenseAction(expenseForm(clientRequestId)), path);

    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense)
      .where(and(eq(expense.orgId, ORG_ID), eq(expense.clientRequestId, clientRequestId))));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: "supplies", amount: "10.5000", accountId: fromAccountId });
    expect(new Set(framework.revalidated)).toEqual(new Set([
      "/historial",
      "/",
      "/liquidez",
      "/movimientos/registrar",
    ]));
  });

  it("records the exact payable compensation through the governed action and replays once", async () => {
    const clientRequestId = randomUUID();
    const path = "/movimientos/registrar?saved=expense&category=treasurer_comp_payout&currency=USD&amount=30.0000&fiscalYear=2026";

    await expectRedirect(() => recordTreasurerCompensationAction(compensationForm(clientRequestId)), path);
    await expectRedirect(() => recordTreasurerCompensationAction(compensationForm(clientRequestId)), path);

    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, clientRequestId),
    )));
    expect(rows).toEqual([expect.objectContaining({
      accountId: fromAccountId,
      beneficiaryMemberId: ACTOR_ID,
      category: "treasurer_comp_payout",
      purpose: "pago a tesorera",
      amount: "30.0000",
    })]);
  });

  it("returns refreshed safe figures for a stale preview and writes nothing", async () => {
    await expectRedirect(
      () => recordTreasurerCompensationAction(compensationForm(randomUUID(), "55.01")),
      "/movimientos/registrar?error=compensation-ceiling-exceeded&fiscalYear=2026&cumulativeEntitlement=55.0000&cumulativePaid=0.0000&payableNow=55.0000",
    );
    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.category, "treasurer_comp_payout"),
    )));
    const foreignRows = await withTenantTransaction(FOREIGN_ORG_ID, (tx) => tx.select().from(expense).where(
      eq(expense.orgId, FOREIGN_ORG_ID),
    ));
    expect(rows).toEqual([]);
    expect(foreignRows).toEqual([]);
  });

  it("authenticates before strict compensation parsing", async () => {
    process.env.E2E_AUTH_BYPASS = "0";
    const malformed = new FormData();
    malformed.set("orgId", FOREIGN_ORG_ID);
    await expectRedirect(() => recordTreasurerCompensationAction(malformed), "/auth/login");
    process.env.E2E_AUTH_BYPASS = "1";
  });

  it.each([
    ["unknown field", (formData: FormData) => formData.set("orgId", FOREIGN_ORG_ID)],
    ["duplicate amount", (formData: FormData) => formData.append("amount", "1.00")],
    ["invalid year", (formData: FormData) => formData.set("fiscalYear", "1999")],
    ["invalid date", (formData: FormData) => formData.set("datedOn", "2026-02-31")],
  ])("strictly rejects compensation %s", async (_case, mutate) => {
    const formData = compensationForm();
    mutate(formData);
    await expectRedirect(() => recordTreasurerCompensationAction(formData), _case === "invalid year"
      ? "/movimientos/registrar?error=invalid-form"
      : "/movimientos/registrar?error=invalid-form&fiscalYear=2026");
    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.category, "treasurer_comp_payout"),
    )));
    expect(rows).toEqual([]);
  });

  it("distinguishes replay conflicts and account/actor boundaries without leaking details", async () => {
    const clientRequestId = randomUUID();
    await expectRedirect(
      () => recordTreasurerCompensationAction(compensationForm(clientRequestId, "10.00")),
      "/movimientos/registrar?saved=expense&category=treasurer_comp_payout&currency=USD&amount=10.0000&fiscalYear=2026",
    );
    await expectRedirect(
      () => recordTreasurerCompensationAction(compensationForm(clientRequestId, "9.00")),
      "/movimientos/registrar?error=compensation-request-conflict&fiscalYear=2026",
    );
    const unavailable = compensationForm();
    unavailable.set("accountId", foreignAccountId);
    await expectRedirect(
      () => recordTreasurerCompensationAction(unavailable),
      "/movimientos/registrar?error=account-unavailable&fiscalYear=2026",
    );

    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.update(member).set({ role: "aportante", status: "activo" }).where(and(
        eq(member.orgId, ORG_ID),
        eq(member.id, ACTOR_ID),
      ));
    });
    try {
      await expectRedirect(
        () => recordTreasurerCompensationAction(compensationForm()),
        "/movimientos/registrar?error=compensation-actor-invalid&fiscalYear=2026",
      );
    } finally {
      await withTenantTransaction(ORG_ID, async (tx) => {
        await tx.update(member).set({ role: "tesorera", status: "activo" }).where(and(
          eq(member.orgId, ORG_ID),
          eq(member.id, ACTOR_ID),
        ));
      });
    }
    const compensationAudits = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_ID),
      eq(auditLogEntry.actionKind, "treasurer_compensation.paid"),
    )));
    const compensationExpenses = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.category, "treasurer_comp_payout"),
    )));
    const foreignExpenses = await withTenantTransaction(FOREIGN_ORG_ID, (tx) => tx.select().from(expense).where(
      eq(expense.orgId, FOREIGN_ORG_ID),
    ));
    expect(compensationAudits).toEqual([expect.objectContaining({ subjectId: compensationExpenses[0]?.id })]);
    expect(compensationExpenses).toEqual([expect.objectContaining({ clientRequestId })]);
    expect(foreignExpenses).toEqual([]);
  });

  it("preserves a validated non-current fiscal year with matching typed figures", async () => {
    const accepted = compensationForm(randomUUID(), "10.00");
    accepted.set("fiscalYear", "2027");
    accepted.set("datedOn", "2027-01-11");
    await expectRedirect(
      () => recordTreasurerCompensationAction(accepted),
      "/movimientos/registrar?saved=expense&category=treasurer_comp_payout&currency=USD&amount=10.0000&fiscalYear=2027",
    );

    const stale = compensationForm(randomUUID(), "46.00");
    stale.set("fiscalYear", "2027");
    stale.set("datedOn", "2027-01-11");
    await expectRedirect(
      () => recordTreasurerCompensationAction(stale),
      "/movimientos/registrar?error=compensation-ceiling-exceeded&fiscalYear=2027&cumulativeEntitlement=55.0000&cumulativePaid=10.0000&payableNow=45.0000",
    );
  });

  it("records a transfer once and redirects with fixed transfer success state", async () => {
    const clientRequestId = randomUUID();
    const path = "/movimientos/registrar?saved=transfer&category=transfer&currency=USD&amount=7.2500";

    const browserSubmission = transferForm(clientRequestId);
    browserSubmission.set("$ACTION_ID_recordTransferAction", "");

    await expectRedirect(() => recordTransferAction(browserSubmission), path);
    await expectRedirect(() => recordTransferAction(transferForm(clientRequestId)), path);

    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(transfer)
      .where(and(eq(transfer.orgId, ORG_ID), eq(transfer.clientRequestId, clientRequestId))));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fromAccountId, toAccountId, purpose: "transfer", amount: "7.2500" });
  });

  it.each([
    ["File scalar", (formData: FormData) => formData.set("amount", new File(["10"], "amount.txt"))],
    ["duplicate scalar", (formData: FormData) => formData.append("amount", "11.00")],
    ["unknown field", (formData: FormData) => formData.set("orgId", randomUUID())],
    ["missing request UUID", (formData: FormData) => formData.delete("clientRequestId")],
    ["invalid category", (formData: FormData) => formData.set("category", "other")],
  ])("rejects malformed expense %s with fixed copy and no write", async (_case, mutate) => {
    const formData = expenseForm();
    mutate(formData);

    await expectRedirect(() => recordExpenseAction(formData), "/movimientos/registrar?error=invalid-form");

    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select({ id: expense.id }).from(expense)
      .where(eq(expense.orgId, ORG_ID)));
    expect(rows).toEqual([]);
  });

  it("rejects client-supplied cross-kind, attached, cross-tenant, and forged slip IDs", async () => {
    const attachedExpenseId = randomUUID();
    const [crossKind, alreadyAttached, crossTenant] = await db.insert(slipPhoto).values([
      {
        orgId: ORG_ID,
        uri: "private/slips/action-contribution.png",
        mimeType: "image/png",
        byteSize: 68,
        contentHash: "a".repeat(64),
        attachedToKind: "contribution",
        attachedToId: randomUUID(),
        uploadedAt: new Date("2026-07-11T12:00:00.000Z"),
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
      {
        orgId: ORG_ID,
        uri: "private/slips/action-expense.png",
        mimeType: "image/png",
        byteSize: 68,
        contentHash: "b".repeat(64),
        attachedToKind: "expense",
        attachedToId: attachedExpenseId,
        uploadedAt: new Date("2026-07-11T12:00:00.000Z"),
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
      {
        orgId: FOREIGN_ORG_ID,
        uri: "private/slips/action-foreign.png",
        mimeType: "image/png",
        byteSize: 68,
        contentHash: "c".repeat(64),
        attachedToKind: "contribution",
        attachedToId: randomUUID(),
        uploadedAt: new Date("2026-07-11T12:00:00.000Z"),
        uploadedBy: ACTOR_ID,
        uploadedByKind: "member",
      },
    ]).returning();
    if (!crossKind || !alreadyAttached || !crossTenant) throw new Error("test_slips_not_created");
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.insert(expense).values({
        id: attachedExpenseId,
        orgId: ORG_ID,
        purpose: "supplies",
        notes: null,
        amount: "1.0000",
        currencyCode: "USD",
        incurredOn: "2026-07-11",
        status: "paid",
        recordedAt: new Date("2026-07-11T12:00:00.000Z"),
        accountId: fromAccountId,
        category: "supplies",
        slipPhotoId: alreadyAttached.id,
        createdAt: new Date("2026-07-11T12:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "member",
      });
    });

    for (const slipPhotoId of [crossKind.id, alreadyAttached.id, crossTenant.id, randomUUID()]) {
      const formData = expenseForm();
      formData.set("slipPhotoId", slipPhotoId);
      await expectRedirect(() => recordExpenseAction(formData), "/movimientos/registrar?error=invalid-form");
    }

    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select({ id: expense.id }).from(expense)
      .where(eq(expense.orgId, ORG_ID)));
    expect(rows).toEqual([{ id: attachedExpenseId }]);
  });

  it.each(["treasurer_comp_payout", "solidarity_payout"])(
    "keeps governed %s attempts out of the generic expense action",
    async (category) => {
    const formData = expenseForm();
    formData.set("category", category);

    await expectRedirect(
      () => recordExpenseAction(formData),
      "/movimientos/registrar?error=governed-payout-required",
    );
    },
  );

  it("returns exhausted figures after the shared entitlement was fully paid", async () => {
    await expectRedirect(
      () => recordTreasurerCompensationAction(compensationForm(randomUUID(), "55.00")),
      "/movimientos/registrar?saved=expense&category=treasurer_comp_payout&currency=USD&amount=55.0000&fiscalYear=2026",
    );
    await expectRedirect(
      () => recordTreasurerCompensationAction(compensationForm(randomUUID(), "0.01")),
      "/movimientos/registrar?error=compensation-ceiling-exceeded&fiscalYear=2026&cumulativeEntitlement=55.0000&cumulativePaid=55.0000&payableNow=0.0000",
    );
  });

  it("rolls the payout back when its audit append fails", async () => {
    const clientRequestId = randomUUID();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const trigger = `reject_comp_action_audit_${suffix}`;
    const triggerFunction = `${trigger}_fn`;
    await db.execute(sql.raw(`
      CREATE FUNCTION ${triggerFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action_kind = 'treasurer_compensation.paid'
          AND NEW.payload_snapshot->>'clientRequestId' = '${clientRequestId}' THEN
          RAISE EXCEPTION 'reject action audit';
        END IF;
        RETURN NEW;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${trigger}
      BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()
    `));
    try {
      await expectRedirect(
        () => recordTreasurerCompensationAction(compensationForm(clientRequestId, "10.00")),
        "/movimientos/registrar?error=action-failed&fiscalYear=2026",
      );
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger} ON audit_log_entry`));
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${triggerFunction}()`));
    }
    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, clientRequestId),
    )));
    expect(rows).toEqual([]);
  });

  it("decodes, uploads, and persists a valid expense slip", async () => {
    const formData = expenseForm();
    const clientRequestId = formData.get("clientRequestId") as string;
    formData.set("slipPhoto", onePixelPng());

    await expectRedirect(() => recordExpenseAction(formData),
      "/movimientos/registrar?saved=expense&category=supplies&currency=USD&amount=10.5000");

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^expense-slip-candidates/${ORG_ID}/${clientRequestId}/[0-9a-f-]{36}-[a-f0-9]{64}\\.png$`)),
      expect.any(Blob),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "image/png",
      }),
    );
    const [savedExpense] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, clientRequestId),
    )));
    const [savedSlip] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(slipPhoto).where(and(
      eq(slipPhoto.orgId, ORG_ID),
      eq(slipPhoto.id, savedExpense?.slipPhotoId ?? randomUUID()),
    )));
    expect(savedSlip).toMatchObject({
      attachedToKind: "expense",
      attachedToId: savedExpense?.id,
      mimeType: "image/png",
      byteSize: 68,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("preserves committed evidence and removes only the unreferenced upload from a concurrent retry", async () => {
    const clientRequestId = randomUUID();
    const first = expenseForm(clientRequestId);
    const second = expenseForm(clientRequestId);
    first.set("slipPhoto", onePixelPng());
    second.set("slipPhoto", onePixelPng());

    const outcomes = await Promise.allSettled([recordExpenseAction(first), recordExpenseAction(second)]);
    expect(outcomes).toEqual([
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({
        message: expect.stringContaining("saved=expense"),
      }) }),
      expect.objectContaining({ status: "rejected", reason: expect.objectContaining({
        message: expect.stringContaining("saved=expense"),
      }) }),
    ]);
    const uploadedUris = vi.mocked(put).mock.results.map((result) => (result.value as Promise<{ url: string }>))
      .map(async (result) => (await result).url);
    const resolvedUris = await Promise.all(uploadedUris);
    const [savedExpense] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, clientRequestId),
    )));
    const [savedSlip] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(slipPhoto).where(and(
      eq(slipPhoto.orgId, ORG_ID),
      eq(slipPhoto.id, savedExpense?.slipPhotoId ?? randomUUID()),
    )));
    const orphanUri = resolvedUris.find((uri) => uri !== savedSlip?.uri);

    expect(new Set(resolvedUris).size).toBe(2);
    expect(savedSlip?.uri).toBeDefined();
    expect(orphanUri).toBeDefined();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(orphanUri);
    expect(del).not.toHaveBeenCalledWith(savedSlip?.uri);
  });

  it("does not delete an uploaded URI when it is already referenced by a committed retry", async () => {
    const clientRequestId = randomUUID();
    const first = expenseForm(clientRequestId);
    first.set("slipPhoto", onePixelPng());
    await expectRedirect(() => recordExpenseAction(first),
      "/movimientos/registrar?saved=expense&category=supplies&currency=USD&amount=10.5000");
    const [savedSlip] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(slipPhoto).where(
      eq(slipPhoto.orgId, ORG_ID),
    ));
    vi.mocked(put).mockResolvedValueOnce({ url: savedSlip?.uri ?? "" } as Awaited<ReturnType<typeof put>>);
    const retry = expenseForm(clientRequestId);
    retry.set("slipPhoto", onePixelPng());

    await expectRedirect(() => recordExpenseAction(retry),
      "/movimientos/registrar?saved=expense&category=supplies&currency=USD&amount=10.5000");

    expect(del).not.toHaveBeenCalled();
  });

  it("records a durable cleanup alert when deletion of a proven orphan fails", async () => {
    vi.mocked(del).mockRejectedValueOnce(new Error("provider unavailable"));
    const rejected = expenseForm();
    rejected.set("accountId", randomUUID());
    rejected.set("slipPhoto", onePixelPng());

    await expectRedirect(() => recordExpenseAction(rejected), "/movimientos/registrar?error=account-unavailable");

    const cleanupAlerts = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(alert).where(and(
      eq(alert.orgId, ORG_ID),
      eq(alert.alertKind, "blob_cleanup_required"),
    )));
    expect(cleanupAlerts).toEqual([expect.objectContaining({
      severity: "high",
      audience: "treasurer",
      subjectKind: "expense_slip",
      payload: expect.objectContaining({ uri: expect.stringContaining("expense-slip-candidates/") }),
    })]);
  });

  it("preserves committed evidence and records an orphan when a transient DB failure follows upload", async () => {
    const committedRequestId = randomUUID();
    const committed = expenseForm(committedRequestId);
    committed.set("slipPhoto", onePixelPng());
    await expectRedirect(() => recordExpenseAction(committed),
      "/movimientos/registrar?saved=expense&category=supplies&currency=USD&amount=10.5000");
    const [committedExpense] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, committedRequestId),
    )));
    const [committedSlip] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(slipPhoto).where(and(
      eq(slipPhoto.orgId, ORG_ID),
      eq(slipPhoto.id, committedExpense?.slipPhotoId ?? randomUUID()),
    )));
    const failedRequestId = randomUUID();
    const suffix = randomUUID().replaceAll("-", "");
    const trigger = `reject_expense_${suffix}`;
    const triggerFunction = `${trigger}_fn`;
    await db.execute(sql.raw(`
      CREATE FUNCTION ${triggerFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.client_request_id = '${failedRequestId}'::uuid THEN
          RAISE EXCEPTION 'transient expense persistence failure';
        END IF;
        RETURN NEW;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${trigger}
      BEFORE INSERT ON expense
      FOR EACH ROW EXECUTE FUNCTION ${triggerFunction}()
    `));
    vi.mocked(del).mockRejectedValueOnce(new Error("transient blob delete failure"));
    const failed = expenseForm(failedRequestId);
    failed.set("slipPhoto", onePixelPng());

    try {
      await expectRedirect(() => recordExpenseAction(failed), "/movimientos/registrar?error=action-failed");
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger} ON expense`));
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${triggerFunction}()`));
    }

    const persistedCommittedSlip = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(slipPhoto).where(and(
      eq(slipPhoto.orgId, ORG_ID),
      eq(slipPhoto.id, committedSlip?.id ?? randomUUID()),
    )));
    const failedRows = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(expense).where(and(
      eq(expense.orgId, ORG_ID),
      eq(expense.clientRequestId, failedRequestId),
    )));
    const [cleanupAlert] = await withTenantTransaction(ORG_ID, (tx) => tx.select().from(alert).where(and(
      eq(alert.orgId, ORG_ID),
      eq(alert.alertKind, "blob_cleanup_required"),
    )));

    expect(persistedCommittedSlip).toEqual([expect.objectContaining({ uri: committedSlip?.uri })]);
    expect(failedRows).toEqual([]);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalledWith(committedSlip?.uri);
    expect(cleanupAlert?.payload).toEqual(expect.objectContaining({
      reason: "delete_failed",
      uri: vi.mocked(del).mock.calls[0]?.[0],
    }));
  });

  it("rejects invalid image bytes and cleans up an uploaded Blob when the domain write fails", async () => {
    const invalid = expenseForm();
    invalid.set("slipPhoto", new File(["not-an-image"], "receipt.png", { type: "image/png" }));
    await expectRedirect(() => recordExpenseAction(invalid), "/movimientos/registrar?error=invalid-slip");
    expect(put).not.toHaveBeenCalled();

    const rejected = expenseForm();
    rejected.set("accountId", randomUUID());
    rejected.set("slipPhoto", onePixelPng("image/png"));
    await expectRedirect(() => recordExpenseAction(rejected), "/movimientos/registrar?error=account-unavailable");
    expect(del).toHaveBeenCalledWith(expect.stringContaining("https://private.blob.invalid/expense-slip-candidates/"));
  });

  it("rejects a truncated PNG that contains dimensions but no complete image", async () => {
    const formData = expenseForm();
    formData.set("slipPhoto", truncatedPng());

    await expectRedirect(() => recordExpenseAction(formData), "/movimientos/registrar?error=invalid-slip");

    expect(put).not.toHaveBeenCalled();
  });

  it("rejects an image whose server-read bytes exceed five megabytes", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set(new Uint8Array(await onePixelPng().arrayBuffer()));
    const formData = expenseForm();
    formData.set("slipPhoto", new File([bytes], "large.png", { type: "image/png" }));

    await expectRedirect(() => recordExpenseAction(formData), "/movimientos/registrar?error=invalid-slip");

    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate scalar", (formData: FormData) => formData.append("toAccountId", toAccountId)],
    ["unknown field", (formData: FormData) => formData.set("purpose", "regularization")],
    ["same account", (formData: FormData) => formData.set("toAccountId", fromAccountId)],
  ])("rejects malformed transfer %s without a write", async (_case, mutate) => {
    const formData = transferForm();
    mutate(formData);

    const expected = _case === "same account" ? "account-unavailable" : "invalid-form";
    await expectRedirect(() => recordTransferAction(formData), `/movimientos/registrar?error=${expected}`);
    const rows = await withTenantTransaction(ORG_ID, (tx) => tx.select({ id: transfer.id }).from(transfer)
      .where(eq(transfer.orgId, ORG_ID)));
    expect(rows).toEqual([]);
  });

  it("rejects malformed regularization input through the real service boundary without a write", async () => {
    const formData = new FormData();
    formData.set("regularizesKind", "contribution");
    formData.set("regularizesId", randomUUID());
    formData.set("toAccountId", toAccountId);
    formData.set("amount", "10.00");
    formData.set("datedOn", "2026-07-11");
    formData.set("notes", "");
    formData.set("clientRequestId", randomUUID());

    await expectRedirect(() => regularizePendingDepositAction(formData), "/movimientos/registrar?error=invalid-form");
    expect(await withTenantTransaction(ORG_ID, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_ID)))).toEqual([]);
  });

  it("checks authorization before parsing either form", async () => {
    process.env.E2E_AUTH_BYPASS = "0";

    await expectRedirect(() => recordExpenseAction(new FormData()), "/auth/login");
    await expectRedirect(() => recordTransferAction(new FormData()), "/auth/login");
    await expectRedirect(() => regularizePendingDepositAction(new FormData()), "/auth/login");
    expect(framework.redirects).toEqual(["/auth/login", "/auth/login", "/auth/login"]);
  });
});
