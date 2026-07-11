import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { account, auditLogEntry, organization } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The explicit error in beforeAll is clearer than Node's missing-file error.
  }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR_ID = randomUUID();
const triggerSuffix = randomUUID().replaceAll("-", "").slice(0, 16);
const triggerName = `reject_account_audit_${triggerSuffix}`;
const functionName = `${triggerName}_fn`;

let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createAccountsService: typeof import("./accounts")["createAccountsService"];
let defaultIsGroupFund: typeof import("./accounts")["defaultIsGroupFund"];
let hasActiveGroupFundAccount: typeof import("./accounts")["hasActiveGroupFundAccount"];
let normalizeAccountInput: typeof import("./accounts")["normalizeAccountInput"];

describe("account rules", () => {
  beforeAll(async () => {
    ({
      createAccountsService,
      defaultIsGroupFund,
      hasActiveGroupFundAccount,
      normalizeAccountInput,
    } = await import("./accounts"));
  });
  it.each([
    ["group_bank", true],
    ["cash_box", true],
    ["treasurer_personal", false],
    ["external", false],
  ] as const)("defaults %s group-fund membership to %s", (type, expected) => {
    expect(defaultIsGroupFund(type)).toBe(expected);
  });

  it("trims names and preserves an explicit group-fund override", () => {
    expect(normalizeAccountInput({
      type: "treasurer_personal",
      name: "  Cuenta de Ana  ",
      last4: "7733",
      isGroupFund: true,
    })).toEqual({
      type: "treasurer_personal",
      name: "Cuenta de Ana",
      last4: "7733",
      isGroupFund: true,
    });
  });

  it.each(["", "   "])("rejects a blank account name", (name) => {
    expect(() => normalizeAccountInput({ type: "cash_box", name })).toThrow("account_name_required");
  });

  it.each(["123", "12345", "12a4", " 1234 "])("rejects invalid last4 value %s", (last4) => {
    expect(() => normalizeAccountInput({ type: "group_bank", name: "Banco", last4 })).toThrow("account_last4_invalid");
  });

  it("accepts an omitted last4 and detects only active group-fund accounts", () => {
    expect(normalizeAccountInput({ type: "cash_box", name: "Caja" }).last4).toBeNull();
    expect(hasActiveGroupFundAccount([
      { status: "archived", isGroupFund: true },
      { status: "active", isGroupFund: false },
    ])).toBe(false);
    expect(hasActiveGroupFundAccount([
      { status: "archived", isGroupFund: true },
      { status: "active", isGroupFund: true },
    ])).toBe(true);
  });
});

describe("accounts service with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for accounts service integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    for (const [id, displayName] of [[ORG_A, "Accounts test A"], [ORG_B, "Accounts test B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: new Date("2026-07-11T12:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "system",
      }).onConflictDoUpdate({ target: organization.id, set: { status: "active" } });
    }
  });

  afterEach(async () => {
    for (const orgId of [ORG_A, ORG_B]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
      });
    }
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_log_entry`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
  });

  afterAll(async () => {
    await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
  });

  it("lists accounts in a stable order without leaking another tenant", async () => {
    const service = createAccountsService();
    await service.saveAccount({ orgId: ORG_A, actorId: ACTOR_ID, clientRequestId: randomUUID(), name: "Zeta", type: "cash_box" });
    await service.saveAccount({ orgId: ORG_B, actorId: ACTOR_ID, clientRequestId: randomUUID(), name: "Hidden", type: "group_bank" });
    await service.saveAccount({ orgId: ORG_A, actorId: ACTOR_ID, clientRequestId: randomUUID(), name: "Alpha", type: "external" });

    const rows = await service.listAccounts(ORG_A);

    expect(rows.map((row) => [row.orgId, row.name])).toEqual([
      [ORG_A, "Alpha"],
      [ORG_A, "Zeta"],
    ]);
  });

  it("creates and edits only inside the tenant and audits both mutations", async () => {
    const service = createAccountsService();
    const created = await service.saveAccount({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      name: " Banco principal ",
      type: "group_bank",
      last4: "4821",
    });
    const foreign = await service.saveAccount({
      orgId: ORG_B,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      name: "Cuenta ajena",
      type: "external",
    });
    const updated = await service.saveAccount({
      id: created.id,
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      name: "Banco actualizado",
      type: "group_bank",
      isGroupFund: false,
      last4: "4821",
    });

    await expect(service.saveAccount({
      id: foreign.id,
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      name: "No permitido",
      type: "cash_box",
    })).rejects.toThrow("account_not_found");
    expect(updated).toMatchObject({ name: "Banco actualizado", isGroupFund: false, status: "active" });

    const audit = await withTenantTransaction(ORG_A, (tx) => tx.select({
      actionKind: auditLogEntry.actionKind,
      subjectId: auditLogEntry.subjectId,
    }).from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A)).orderBy(auditLogEntry.at, auditLogEntry.actionKind));
    expect(audit).toEqual([
      { actionKind: "account.create", subjectId: created.id },
      { actionKind: "account.update", subjectId: created.id },
    ]);
  });

  it("archives append-only and rejects missing or cross-tenant targets without audit rows", async () => {
    const service = createAccountsService();
    const own = await service.saveAccount({ orgId: ORG_A, actorId: ACTOR_ID, clientRequestId: randomUUID(), name: "Caja", type: "cash_box" });
    const foreign = await service.saveAccount({ orgId: ORG_B, actorId: ACTOR_ID, clientRequestId: randomUUID(), name: "Otra", type: "external" });

    const archived = await service.deactivateAccount({ orgId: ORG_A, actorId: ACTOR_ID, id: own.id });
    const replayedArchive = await service.deactivateAccount({ orgId: ORG_A, actorId: ACTOR_ID, id: own.id });
    await expect(service.deactivateAccount({ orgId: ORG_A, actorId: ACTOR_ID, id: foreign.id }))
      .rejects.toThrow("account_not_found");

    const retained = await withTenantTransaction(ORG_A, (tx) => tx.select({
      id: account.id,
      status: account.status,
    }).from(account).where(and(eq(account.orgId, ORG_A), eq(account.id, own.id))));
    expect(archived.status).toBe("archived");
    expect(replayedArchive).toEqual(archived);
    expect(retained).toEqual([{ id: own.id, status: "archived" }]);
    const archiveAudits = await withTenantTransaction(ORG_A, (tx) => tx.select({
      subjectId: auditLogEntry.subjectId,
    }).from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, ORG_A),
      eq(auditLogEntry.actionKind, "account.archive"),
    )));
    expect(archiveAudits).toEqual([{ subjectId: own.id }]);
  });

  it("returns the same account without duplicate audit when create or update is replayed", async () => {
    const service = createAccountsService();
    const createRequestId = randomUUID();
    const createInput = {
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: createRequestId,
      name: "Cuenta idempotente",
      type: "group_bank" as const,
    };
    const created = await service.saveAccount(createInput);
    const replayedCreate = await service.saveAccount(createInput);
    const updateRequestId = randomUUID();
    const updateInput = {
      ...createInput,
      id: created.id,
      clientRequestId: updateRequestId,
      name: "Cuenta actualizada",
    };
    const updated = await service.saveAccount(updateInput);
    const replayedUpdate = await service.saveAccount(updateInput);
    const replayedCreateAfterUpdate = await service.saveAccount(createInput);

    expect(replayedCreate.id).toBe(created.id);
    expect(replayedUpdate).toEqual(updated);
    expect(replayedCreateAfterUpdate.id).toBe(created.id);
    const rows = await service.listAccounts(ORG_A);
    expect(rows).toHaveLength(1);
    const audits = await withTenantTransaction(ORG_A, (tx) => tx.select({
      actionKind: auditLogEntry.actionKind,
    }).from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_A)).orderBy(auditLogEntry.at));
    expect(audits).toEqual([
      { actionKind: "account.create" },
      { actionKind: "account.update" },
    ]);
  });

  it("rolls back the account mutation when its audit insert fails", async () => {
    await db.execute(sql.raw(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.org_id = '${ORG_A}'::uuid AND NEW.action_kind = 'account.create' THEN
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

    await expect(createAccountsService().saveAccount({
      orgId: ORG_A,
      actorId: ACTOR_ID,
      clientRequestId: randomUUID(),
      name: "Debe revertirse",
      type: "group_bank",
    })).rejects.toThrow("audit rejected for atomicity test");

    const rows = await withTenantTransaction(ORG_A, (tx) => tx.select({ id: account.id }).from(account).where(and(
      eq(account.orgId, ORG_A),
      eq(account.name, "Debe revertirse"),
    )));
    expect(rows).toEqual([]);
  });
});
