import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  account,
  auditLogEntry,
  expense,
  extraordinaryCollection,
  extraordinaryCollectionLine,
  member,
  organization,
  transfer,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile(".env.local"); } catch { /* beforeAll reports the requirement. */ }
}

const sessionState = vi.hoisted(() => ({
  denial: null as null | "no-session" | "wrong-role",
  orgId: "",
  actorId: "33333333-3333-4333-8333-333333333333",
}));

vi.mock("@/lib/auth/require-session", () => ({
  requireTreasurer: async () => {
    if (sessionState.denial === "no-session") throw new Error("NEXT_REDIRECT:/auth/login");
    if (sessionState.denial === "wrong-role") throw new Error("NEXT_REDIRECT:/acceso-denegado");
    return { userId: "test", orgId: sessionState.orgId, actorId: sessionState.actorId, roles: ["TESORERA"] };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); } }));

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const MEMBER_A = randomUUID();
const MEMBER_B = randomUUID();
const ACCOUNT_A = randomUUID();
const PERSONAL_A = randomUUID();
const RETURN_A = randomUUID();
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let actions: typeof import("./actions");

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

function openForm(beneficiaryMemberId = MEMBER_A): FormData {
  return form({
    purpose: "Calamidad doméstica",
    beneficiaryMemberId,
    kind: "solidarity",
    targetAmount: "40.0000",
    recognitionFiscalYear: "",
    openedOn: "2026-07-21",
    clientRequestId: randomUUID(),
  });
}

function addLineForm(collectionId: string, accountId = ACCOUNT_A, amount = "10.0000"): FormData {
  return form({ collectionId, memberId: MEMBER_A, accountId, amount, datedOn: "2026-07-21", clientRequestId: randomUUID() });
}

async function openThroughAction(input = openForm()) {
  await expectRedirect(() => actions.openCollectionAction(input), "/colectas?collectionId=");
  const [collection] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
  return collection;
}

async function expectRedirect(run: () => Promise<unknown>, path: string) {
  await expect(run()).rejects.toThrow(`NEXT_REDIRECT:${path}`);
}

async function withRejectedAudit(actionKind: string, run: () => Promise<void>) {
  if (!/^[a-z.]+$/.test(actionKind)) throw new Error("unsafe test action kind");
  await db.execute(sql.raw(`
    CREATE OR REPLACE FUNCTION task9_reject_command_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action_kind = '${actionKind}' THEN RAISE EXCEPTION 'task9 audit rejection'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER task9_reject_command_audit
    BEFORE INSERT ON audit_log_entry FOR EACH ROW EXECUTE FUNCTION task9_reject_command_audit();
  `));
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try { await run(); } finally {
    diagnostic.mockRestore();
    await db.execute(sql.raw("DROP TRIGGER IF EXISTS task9_reject_command_audit ON audit_log_entry; DROP FUNCTION IF EXISTS task9_reject_command_audit();"));
  }
}

describe("collection server actions", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for collection action tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    for (const [id, name] of [[ORG_A, "Collection actions A"], [ORG_B, "Collection actions B"]] as const) {
      await db.insert(organization).values({
        id, displayName: name, countryCode: "EC", currencyCode: "USD", timezone: "America/Guayaquil",
        defaultLanguage: "es-EC", status: "active", createdAt: new Date("2026-07-21T12:00:00Z"),
        createdBy: sessionState.actorId, createdByKind: "system",
      });
    }
    await db.insert(member).values([
      { id: MEMBER_A, orgId: ORG_A, displayName: "Ana A", joinedOn: "2026-01-01", role: "aportante", status: "activo", initialSavingsBalance: "0.0000", createdAt: new Date("2026-01-01T00:00:00Z"), createdBy: sessionState.actorId, createdByKind: "system" },
      { id: MEMBER_B, orgId: ORG_B, displayName: "Bea B", joinedOn: "2026-01-01", role: "aportante", status: "activo", initialSavingsBalance: "0.0000", createdAt: new Date("2026-01-01T00:00:00Z"), createdBy: sessionState.actorId, createdByKind: "system" },
    ]);
    await db.insert(account).values([
      { id: ACCOUNT_A, orgId: ORG_A, name: "Banco A", type: "group_bank", isGroupFund: true, status: "active", createdAt: new Date("2026-01-01T00:00:00Z"), createdBy: sessionState.actorId },
      { id: PERSONAL_A, orgId: ORG_A, name: "Personal A", type: "treasurer_personal", isGroupFund: false, status: "active", createdAt: new Date("2026-01-01T00:00:00Z"), createdBy: sessionState.actorId },
      { id: RETURN_A, orgId: ORG_A, name: "Retorno A", type: "external", isGroupFund: false, status: "active", createdAt: new Date("2026-01-01T00:00:00Z"), createdBy: sessionState.actorId },
    ]);
    sessionState.orgId = ORG_A;
    actions = await import("./actions");
  });

  beforeEach(async () => {
    sessionState.denial = null;
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A));
      await tx.delete(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A));
      await tx.delete(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A));
      await tx.delete(expense).where(eq(expense.orgId, ORG_A));
      await tx.delete(transfer).where(eq(transfer.orgId, ORG_A));
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(account).where(sql`${account.id} in (${ACCOUNT_A}, ${PERSONAL_A}, ${RETURN_A})`);
    await db.delete(member).where(sql`${member.id} in (${MEMBER_A}, ${MEMBER_B})`);
    await db.delete(organization).where(sql`${organization.id} in (${ORG_A}, ${ORG_B})`);
  });

  it("creates a tenant-scoped collection through the real service", async () => {
    await expectRedirect(() => actions.openCollectionAction(openForm()), "/colectas?collectionId=");
    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orgId: ORG_A, beneficiaryMemberId: MEMBER_A, status: "open" });
  });

  it("adds the first real line and advances the collection to collecting", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [updated] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    const lines = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    expect(updated.status).toBe("collecting");
    expect(lines).toHaveLength(1);
  });

  it("retries and serializes open, add-line, and reversal actions by exact client command", async () => {
    const openInput = openForm();
    await Promise.all([
      expectRedirect(() => actions.openCollectionAction(openInput), "/colectas?collectionId="),
      expectRedirect(() => actions.openCollectionAction(openInput), "/colectas?collectionId="),
    ]);
    const [collection] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)))).toHaveLength(1);
    const conflictingOpen = openForm();
    conflictingOpen.set("clientRequestId", String(openInput.get("clientRequestId")));
    conflictingOpen.set("purpose", "Different calamity");
    await expectRedirect(() => actions.openCollectionAction(conflictingOpen), "/colectas?error=collection-idempotency-conflict");

    const addInput = addLineForm(collection.id);
    await Promise.all([
      expectRedirect(() => actions.addCollectionLineAction(addInput), `/colectas?collectionId=${collection.id}&saved=1`),
      expectRedirect(() => actions.addCollectionLineAction(addInput), `/colectas?collectionId=${collection.id}&saved=1`),
    ]);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)))).toHaveLength(1);
    const conflictingAdd = addLineForm(collection.id, ACCOUNT_A, "11.0000");
    conflictingAdd.set("clientRequestId", String(addInput.get("clientRequestId")));
    await expectRedirect(() => actions.addCollectionLineAction(conflictingAdd), `/colectas?error=collection-idempotency-conflict&collectionId=${collection.id}`);

    const reverseInput = form({ collectionId: collection.id, lineId: line.id, reason: "Aporte duplicado en acta", clientRequestId: randomUUID() });
    await Promise.all([
      expectRedirect(() => actions.reverseCollectionLineAction(reverseInput), `/colectas?collectionId=${collection.id}&saved=1`),
      expectRedirect(() => actions.reverseCollectionLineAction(reverseInput), `/colectas?collectionId=${collection.id}&saved=1`),
    ]);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)))).toHaveLength(2);
    const conflictingReverse = form({ collectionId: collection.id, lineId: line.id, reason: "Otra corrección válida", clientRequestId: String(reverseInput.get("clientRequestId")) });
    await expectRedirect(() => actions.reverseCollectionLineAction(conflictingReverse), `/colectas?error=collection-idempotency-conflict&collectionId=${collection.id}`);
    await expectRedirect(() => actions.reverseCollectionLineAction(form({ collectionId: collection.id, lineId: line.id, reason: "Intento diferente válido", clientRequestId: randomUUID() })), `/colectas?error=collection-reversal-invalid&collectionId=${collection.id}`);
  });

  it("rolls back the line and lifecycle transition when the audit append fails", async () => {
    const collection = await openThroughAction();
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION task9_reject_collection_line_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action_kind = 'collection.line.added' THEN RAISE EXCEPTION 'task9 audit rejection'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER task9_reject_collection_line_audit
      BEFORE INSERT ON audit_log_entry FOR EACH ROW EXECUTE FUNCTION task9_reject_collection_line_audit();
    `));
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expectRedirect(() => actions.addCollectionLineAction(form({
        collectionId: collection.id, memberId: MEMBER_A, accountId: ACCOUNT_A, amount: "10.0000",
        datedOn: "2026-07-21", clientRequestId: randomUUID(),
      })), `/colectas?error=action-failed&collectionId=${collection.id}`);
    } finally {
      diagnostic.mockRestore();
      await db.execute(sql.raw("DROP TRIGGER IF EXISTS task9_reject_collection_line_audit ON audit_log_entry; DROP FUNCTION IF EXISTS task9_reject_collection_line_audit();"));
    }
    const [unchanged] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(unchanged.status).toBe("open");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)))).toEqual([]);
  });

  it("rejects unknown fields before a write", async () => {
    const input = openForm();
    input.set("orgId", ORG_B);
    await expectRedirect(() => actions.openCollectionAction(input), "/colectas?error=invalid-form");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)))).toEqual([]);
  });

  it.each([
    ["addCollectionLineAction", () => addLineForm(randomUUID())],
    ["reverseCollectionLineAction", () => form({ collectionId: randomUUID(), lineId: randomUUID(), reason: "Corrección documentada", clientRequestId: randomUUID() })],
    ["regularizeCollectionLineAction", () => form({ collectionId: randomUUID(), lineId: randomUUID(), sourceAccountId: PERSONAL_A, toAccountId: ACCOUNT_A, amount: "10.0000", datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID() })],
    ["payoutCollectionAction", () => form({ collectionId: randomUUID(), sourceAccountId: ACCOUNT_A, payoutAmount: "10.0000", datedOn: "2026-07-21", disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId: randomUUID() })],
    ["cancelCollectionAction", () => form({ collectionId: randomUUID(), datedOn: "2026-07-21", disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId: randomUUID() })],
    ["closeRecognitionCollectionAction", () => form({ collectionId: randomUUID(), dispositionMotive: "Acta julio 2026", clientRequestId: randomUUID() })],
  ] as const)("strictly rejects unknown fields for %s with an otherwise valid payload", async (actionName, payload) => {
    const input = payload(); input.set("orgId", ORG_B);
    await expectRedirect(() => actions[actionName](input), "/colectas?error=invalid-form");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)))).toEqual([]);
  });

  it.each(["payoutCollectionAction", "cancelCollectionAction"] as const)("rejects an over-limit disposition motive for %s", async (actionName) => {
    const input = form({ collectionId: randomUUID(), datedOn: "2026-07-21", disposition: "retained", dispositionMotive: "x".repeat(501), returnAccountId: "", clientRequestId: randomUUID() });
    if (actionName === "payoutCollectionAction") {
      input.set("sourceAccountId", ACCOUNT_A); input.set("payoutAmount", "1.0000");
    }
    await expectRedirect(() => actions[actionName](input), "/colectas?error=invalid-form");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)))).toEqual([]);
  });

  it("cannot resolve another tenant's beneficiary", async () => {
    await expectRedirect(() => actions.openCollectionAction(openForm(MEMBER_B)), "/colectas?error=collection-not-found");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)))).toEqual([]);
  });

  it("reverses a posted line through the real append-only service", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id)));
    await expectRedirect(() => actions.reverseCollectionLineAction(form({ collectionId: collection.id, lineId: line.id, reason: "Aporte duplicado en acta", clientRequestId: randomUUID() })), `/colectas?collectionId=${collection.id}&saved=1`);
    const lines = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id)));
    expect(lines).toHaveLength(2);
    expect(lines.find((candidate) => candidate.reversesId === line.id)?.amount).toBe("10.0000");
  });

  it("regularizes only the collection-bound pending line through the real movement service", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, PERSONAL_A)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id)));
    await expectRedirect(() => actions.regularizeCollectionLineAction(form({
      collectionId: collection.id, lineId: line.id, sourceAccountId: PERSONAL_A, toAccountId: ACCOUNT_A,
      amount: "10.0000", datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID(),
    })), `/colectas?collectionId=${collection.id}&saved=1`);
    const [updated] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.id, line.id)));
    const transfers = await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.regularizesId, line.id)));
    expect(updated.reconciliationStatus).toBe("regularized");
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ fromAccountId: PERSONAL_A, toAccountId: ACCOUNT_A, amount: "10.0000" });
  });

  it("rejects a forged regularization source before writing a transfer", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, PERSONAL_A)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    await expectRedirect(() => actions.regularizeCollectionLineAction(form({ collectionId: collection.id, lineId: line.id, sourceAccountId: RETURN_A, toAccountId: ACCOUNT_A, amount: "10.0000", datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID() })), `/colectas?error=collection-not-found&collectionId=${collection.id}`);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toEqual([]);
  });

  it("rejects stale regularization amounts in both directions and accepts only the authoritative remainder", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, PERSONAL_A)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    const auditsBefore = await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A)));
    const attempt = (amount: string) => actions.regularizeCollectionLineAction(form({
      collectionId: collection.id, lineId: line.id, sourceAccountId: PERSONAL_A, toAccountId: ACCOUNT_A,
      amount, datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID(),
    }));
    await expectRedirect(() => attempt("9.9999"), `/colectas?error=collection-transition-invalid&collectionId=${collection.id}`);
    await expectRedirect(() => attempt("10.0001"), `/colectas?error=collection-transition-invalid&collectionId=${collection.id}`);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toEqual([]);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A)))).toHaveLength(auditsBefore.length);
    await expectRedirect(() => attempt("10.0000"), `/colectas?collectionId=${collection.id}&saved=1`);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toHaveLength(1);
  });

  it("preserves exact-client regularization replay without a second transfer", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, PERSONAL_A)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    const input = form({ collectionId: collection.id, lineId: line.id, sourceAccountId: PERSONAL_A, toAccountId: ACCOUNT_A, amount: "10.0000", datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID() });
    await expectRedirect(() => actions.regularizeCollectionLineAction(input), `/colectas?collectionId=${collection.id}&saved=1`);
    await expectRedirect(() => actions.regularizeCollectionLineAction(input), `/colectas?collectionId=${collection.id}&saved=1`);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toHaveLength(1);
  });

  it("maps an over-ceiling payout safely and then closes on the exact ceiling", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, ACCOUNT_A, "30.0000")), `/colectas?collectionId=${collection.id}&saved=1`);
    const payout = (amount: string, clientRequestId = randomUUID()) => actions.payoutCollectionAction(form({
      collectionId: collection.id, sourceAccountId: ACCOUNT_A, payoutAmount: amount, datedOn: "2026-07-21",
      disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId,
    }));
    await expectRedirect(() => payout("30.0001"), `/colectas?error=collection-payout-above-ceiling&collectionId=${collection.id}`);
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense).where(eq(expense.orgId, ORG_A)))).toEqual([]);
    await expectRedirect(() => payout("30.0000"), `/colectas?collectionId=${collection.id}&saved=1`);
    const [closed] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    const expenses = await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense).where(eq(expense.orgId, ORG_A)));
    expect(closed).toMatchObject({ status: "closed", surplusAmount: "0.0000" });
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ category: "solidarity_payout", amount: "30.0000" });
  });

  it("cancels an empty collection through the real service", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.cancelCollectionAction(form({ collectionId: collection.id, datedOn: "2026-07-21", disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId: randomUUID() })), `/colectas?collectionId=${collection.id}&saved=1`);
    const [cancelled] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(cancelled).toMatchObject({ status: "cancelled", surplusAmount: "0.0000" });
  });

  it("closes a recognition collection through the legal retained path", async () => {
    const recognition = openForm();
    recognition.set("kind", "treasurer_recognition"); recognition.set("recognitionFiscalYear", "2026");
    const collection = await openThroughAction(recognition);
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, ACCOUNT_A, "12.0000")), `/colectas?collectionId=${collection.id}&saved=1`);
    await expectRedirect(() => actions.closeRecognitionCollectionAction(form({ collectionId: collection.id, dispositionMotive: "Acta julio 2026", clientRequestId: randomUUID() })), `/colectas?collectionId=${collection.id}&saved=1`);
    const [closed] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(closed).toMatchObject({ status: "closed", disposition: "retained", dispositionMotive: "Acta julio 2026", surplusAmount: "12.0000" });
  });

  it("rolls back reversal when its audit append fails", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    await withRejectedAudit("collection.line.reversed", () => expectRedirect(() => actions.reverseCollectionLineAction(form({ collectionId: collection.id, lineId: line.id, reason: "Corrección documentada", clientRequestId: randomUUID() })), `/colectas?error=action-failed&collectionId=${collection.id}`));
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)))).toHaveLength(1);
  });

  it("rolls back regularization when its audit append fails", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, PERSONAL_A)), `/colectas?collectionId=${collection.id}&saved=1`);
    const [line] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    await withRejectedAudit("movement.regularization", () => expectRedirect(() => actions.regularizeCollectionLineAction(form({ collectionId: collection.id, lineId: line.id, sourceAccountId: PERSONAL_A, toAccountId: ACCOUNT_A, amount: "10.0000", datedOn: "2026-07-21", confirmed: "yes", clientRequestId: randomUUID() })), `/colectas?error=action-failed&collectionId=${collection.id}`));
    const [unchanged] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, ORG_A)));
    expect(unchanged.reconciliationStatus).toBe("pending");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(transfer).where(eq(transfer.orgId, ORG_A)))).toEqual([]);
  });

  it("rolls back payout when its audit append fails", async () => {
    const collection = await openThroughAction();
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, ACCOUNT_A, "10.0000")), `/colectas?collectionId=${collection.id}&saved=1`);
    await withRejectedAudit("collection.payout.recorded", () => expectRedirect(() => actions.payoutCollectionAction(form({ collectionId: collection.id, sourceAccountId: ACCOUNT_A, payoutAmount: "10.0000", datedOn: "2026-07-21", disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId: randomUUID() })), `/colectas?error=action-failed&collectionId=${collection.id}`));
    const [unchanged] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(unchanged.status).toBe("collecting");
    expect(await withTenantTransaction(ORG_A, (tx) => tx.select().from(expense).where(eq(expense.orgId, ORG_A)))).toEqual([]);
  });

  it("rolls back cancellation when its status audit fails", async () => {
    const collection = await openThroughAction();
    await withRejectedAudit("collection.status.changed", () => expectRedirect(() => actions.cancelCollectionAction(form({ collectionId: collection.id, datedOn: "2026-07-21", disposition: "", dispositionMotive: "", returnAccountId: "", clientRequestId: randomUUID() })), `/colectas?error=action-failed&collectionId=${collection.id}`));
    const [unchanged] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(unchanged.status).toBe("open");
  });

  it("rolls back recognition close when its status audit fails", async () => {
    const recognition = openForm(); recognition.set("kind", "treasurer_recognition"); recognition.set("recognitionFiscalYear", "2026");
    const collection = await openThroughAction(recognition);
    await expectRedirect(() => actions.addCollectionLineAction(addLineForm(collection.id, ACCOUNT_A, "12.0000")), `/colectas?collectionId=${collection.id}&saved=1`);
    await withRejectedAudit("collection.status.changed", () => expectRedirect(() => actions.closeRecognitionCollectionAction(form({ collectionId: collection.id, dispositionMotive: "Acta julio 2026", clientRequestId: randomUUID() })), `/colectas?error=action-failed&collectionId=${collection.id}`));
    const [unchanged] = await withTenantTransaction(ORG_A, (tx) => tx.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, ORG_A)));
    expect(unchanged.status).toBe("collecting");
  });

  it("redirects an unauthenticated caller before parsing attacker-controlled data", async () => {
    sessionState.denial = "no-session";
    await expect(actions.openCollectionAction(new FormData())).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("denies an authenticated caller without the treasurer role before parsing", async () => {
    sessionState.denial = "wrong-role";
    await expect(actions.openCollectionAction(new FormData())).rejects.toThrow("NEXT_REDIRECT:/acceso-denegado");
  });
});
