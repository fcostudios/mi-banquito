import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { and, eq, inArray, sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { collectionProgress, collectionSettlement, createExtraordinaryCollectionService } from "./extraordinary-collections";
import { createMovementService } from "./movements";
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
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // The integration suite reports the missing real-PostgreSQL configuration.
  }
}

describe("collectionProgress", () => {
  it("nets reversals and counts only contributors with positive net value", () => {
    expect(collectionProgress({
      activeMemberCount: 4,
      lines: [
        { id: "l1", memberId: "m1", amount: "10.0000", reconciliationStatus: "regularized", reversesId: null },
        { id: "l2", memberId: "m2", amount: "7.1250", reconciliationStatus: "pending", reversesId: null },
        { id: "l3", memberId: "m1", amount: "10.0000", reconciliationStatus: "regularized", reversesId: "l1" },
      ],
    })).toEqual({
      contributors: 1,
      activeMembers: 4,
      collected: "7.1250",
      regularized: "0.0000",
      pending: "7.1250",
    });
  });

  it("makes a matching reversal pair contribute exactly zero to its reconciliation bucket", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 0n, max: 999_999_999_999_999_999n }),
      fc.constantFrom("regularized" as const, "pending" as const),
      (units, reconciliationStatus) => {
        const amount = `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
        const progress = collectionProgress({
          activeMemberCount: 1,
          lines: [
            { id: "original", memberId: "member", amount, reconciliationStatus, reversesId: null },
            { id: "reversal", memberId: "member", amount, reconciliationStatus, reversesId: "original" },
          ],
        });

        expect(progress[reconciliationStatus]).toBe("0.0000");
        expect(progress.collected).toBe("0.0000");
        expect(progress.contributors).toBe(0);
      },
    ), { seed: 96, numRuns: 500 });
  });

  it.each([
    ["NaN", "money4_invalid"],
    ["Infinity", "money4_invalid"],
    ["1e3", "money4_invalid"],
    ["1.00001", "money4_invalid"],
    ["-0.0001", "collection_amount_non_negative_required"],
    ["", "money4_invalid"],
    [" 1.0000", "money4_invalid"],
  ])(
    "rejects malformed collection money %s",
    (amount, error) => expect(() => collectionProgress({
      activeMemberCount: 1,
      lines: [{ id: "line", memberId: "member", amount, reconciliationStatus: "regularized", reversesId: null }],
    })).toThrow(error),
  );

  it("rejects collection totals that overflow numeric(18,4)", () => {
    expect(() => collectionProgress({
      activeMemberCount: 2,
      lines: [
        { id: "one", memberId: "one", amount: "99999999999999.9999", reconciliationStatus: "regularized", reversesId: null },
        { id: "two", memberId: "two", amount: "0.0001", reconciliationStatus: "regularized", reversesId: null },
      ],
    })).toThrow("money4_out_of_range");
  });
});

describe("collectionSettlement", () => {
  it("preserves exact money under every payout within the regularized ceiling", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 999_999_999_999_999_999n }).chain((regularizedUnits) => fc.tuple(
        fc.constant(regularizedUnits),
        fc.bigInt({ min: 1n, max: regularizedUnits }),
      )),
      ([regularizedUnits, payoutUnits]) => {
        const money = (units: bigint) => `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
        const settled = collectionSettlement({
          regularized: money(regularizedUnits), payout: money(payoutUnits),
        });
        expect(parseMoney(settled.payout) + parseMoney(settled.surplus)).toBe(parseMoney(settled.ceiling));
        expect(parseMoney(settled.surplus)).toBeGreaterThanOrEqual(0n);
      },
    ), { seed: 97, numRuns: 500 });
  });
});

function parseMoney(value: string): bigint {
  const [whole, fraction] = value.split(".");
  return BigInt(whole ?? "0") * 10_000n + BigInt(fraction ?? "0");
}

describe("extraordinary collection service with PostgreSQL", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const actorId = randomUUID();
  const now = new Date("2026-07-21T16:00:00.000Z");
  const auditTrigger = `reject_collection_audit_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const auditFunction = `${auditTrigger}_fn`;
  let db: typeof import("@mi-banquito/db")["db"];
  let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
  let beneficiaryA: string;
  let contributorA: string;
  let inactiveMemberA: string;
  let beneficiaryB: string;
  let groupAccountA: string;
  let personalAccountA: string;
  let inactiveAccountA: string;
  let groupAccountB: string;
  let personalAccountB: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for extraordinary collection integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));

    for (const [id, displayName] of [[orgA, "Collections A"], [orgB, "Collections B"]] as const) {
      await db.insert(organization).values({
        id,
        displayName,
        countryCode: "EC",
        currencyCode: "USD",
        timezone: "America/Guayaquil",
        defaultLanguage: "es-EC",
        status: "active",
        createdAt: now,
        createdBy: actorId,
        createdByKind: "system",
      });
    }
  });

  beforeEach(async () => {
    const seedMember = async (orgId: string, displayName: string, status: "activo" | "baja" = "activo") => {
      const [row] = await db.insert(member).values({
        orgId,
        displayName,
        joinedOn: "2025-01-01",
        role: "aportante",
        status,
        initialSavingsBalance: "0.0000",
        createdAt: now,
        createdBy: actorId,
        createdByKind: "system",
      }).returning();
      if (!row) throw new Error("test_member_not_created");
      return row.id;
    };
    const seedAccount = async (orgId: string, name: string, isGroupFund: boolean, status: "active" | "archived" = "active") => {
      const [row] = await db.insert(account).values({
        orgId,
        name,
        type: isGroupFund ? "group_bank" : "treasurer_personal",
        isGroupFund,
        status,
        createdAt: now,
        createdBy: actorId,
        clientRequestId: randomUUID(),
      }).returning();
      if (!row) throw new Error("test_account_not_created");
      return row.id;
    };

    beneficiaryA = await seedMember(orgA, "Ana Beneficiaria");
    contributorA = await seedMember(orgA, "Bea Aportante");
    inactiveMemberA = await seedMember(orgA, "Cata Inactiva", "baja");
    beneficiaryB = await seedMember(orgB, "Otra Organización");
    groupAccountA = await seedAccount(orgA, "Banco grupo", true);
    personalAccountA = await seedAccount(orgA, "Cuenta tesorera", false);
    inactiveAccountA = await seedAccount(orgA, "Cuenta archivada", true, "archived");
    groupAccountB = await seedAccount(orgB, "Banco ajeno", true);
    personalAccountB = await seedAccount(orgB, "Canal ajeno", false);
  });

  afterEach(async () => {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${auditTrigger} ON audit_log_entry`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${auditFunction}()`));
    for (const orgId of [orgA, orgB]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, orgId));
        await tx.delete(transfer).where(eq(transfer.orgId, orgId));
        await tx.delete(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.orgId, orgId));
        await tx.delete(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgId));
        await tx.delete(expense).where(eq(expense.orgId, orgId));
        await tx.delete(account).where(eq(account.orgId, orgId));
        await tx.delete(member).where(eq(member.orgId, orgId));
      });
    }
  });

  afterAll(async () => {
    if (db) await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  });

  const openSolidarity = async (overrides: Partial<Parameters<ReturnType<typeof createExtraordinaryCollectionService>["open"]>[0]> = {}) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    return service.open({
      orgId: orgA,
      actorId,
      kind: "solidarity",
      purpose: "  Calamidad doméstica  ",
      beneficiaryMemberId: beneficiaryA,
      targetAmount: "70.5",
      recognitionFiscalYear: null,
      openedOn: "2026-07-21",
      clientRequestId: randomUUID(),
      ...overrides,
    });
  };

  const installAuditFailure = async (actionKind: string, transitionTo?: string) => {
    const transitionPredicate = transitionTo
      ? ` AND NEW.payload_snapshot->>'to' = '${transitionTo}'`
      : "";
    await db.execute(sql.raw(`
      CREATE FUNCTION ${auditFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action_kind = '${actionKind}'${transitionPredicate} THEN RAISE EXCEPTION 'forced collection audit failure'; END IF;
        RETURN NEW;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER ${auditTrigger} BEFORE INSERT ON audit_log_entry
      FOR EACH ROW EXECUTE FUNCTION ${auditFunction}()
    `));
  };

  const terminalRecognition = async (status: "paid_out" | "closed" | "cancelled") => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity({
      kind: "treasurer_recognition",
      purpose: `Recognition ${status}`,
      recognitionFiscalYear: 2026,
      targetAmount: null,
    });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "3.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    if (status === "cancelled") {
      await db.update(extraordinaryCollection).set({
        status: "cancelled", surplusAmount: "3.0000", disposition: "retained",
        dispositionMotive: "Assembly cancellation vote",
      }).where(eq(extraordinaryCollection.id, collection.id));
    } else {
      await db.update(extraordinaryCollection).set({ status: "paid_out" })
        .where(eq(extraordinaryCollection.id, collection.id));
      if (status === "closed") {
        await db.update(extraordinaryCollection).set({
          status: "closed", surplusAmount: "3.0000", disposition: "retained",
          dispositionMotive: "Assembly closing vote",
        }).where(eq(extraordinaryCollection.id, collection.id));
      }
    }
    return { collection, original };
  };

  it("opens a normalized collection for an active same-org beneficiary and audits it exactly", async () => {
    const clientRequestId = randomUUID();
    const saved = await openSolidarity({ clientRequestId });

    expect(saved).toMatchObject({
      orgId: orgA,
      kind: "solidarity",
      purpose: "Calamidad doméstica",
      beneficiaryMemberId: beneficiaryA,
      targetAmount: "70.5000",
      recognitionFiscalYear: null,
      openedOn: "2026-07-21",
      status: "open",
      createdBy: actorId,
    });
    const rows = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actionKind: "collection.opened",
      subjectKind: "extraordinary_collection",
      subjectId: saved.id,
      actorId,
      reason: null,
      payloadSnapshot: {
        kind: "solidarity",
        purpose: "Calamidad doméstica",
        beneficiaryMemberId: beneficiaryA,
        targetAmount: "70.5000",
        recognitionFiscalYear: null,
        openedOn: "2026-07-21",
        clientRequestId,
      },
    });
  });

  it("makes open, add-line, and reversal exact-command idempotent under concurrency", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const openRequest = randomUUID();
    const openInput = {
      orgId: orgA, actorId, kind: "solidarity" as const, purpose: "Idempotent collection",
      beneficiaryMemberId: beneficiaryA, targetAmount: "20.0000", recognitionFiscalYear: null,
      openedOn: "2026-07-21", clientRequestId: openRequest,
    };
    const [openedA, openedB] = await Promise.all([service.open(openInput), service.open(openInput)]);
    expect(openedB).toEqual(openedA);
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgA))).toHaveLength(1);
    await expect(service.open({ ...openInput, purpose: "Different command" })).rejects.toThrow("collection_idempotency_conflict");

    const addRequest = randomUUID();
    const addInput = {
      orgId: orgA, actorId, collectionId: openedA.id, memberId: contributorA,
      accountId: groupAccountA, amount: "7.0000", datedOn: "2026-07-22", clientRequestId: addRequest,
    };
    const [lineA, lineB] = await Promise.all([service.addLine(addInput), service.addLine(addInput)]);
    expect(lineB).toEqual(lineA);
    expect(await db.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, openedA.id))).toHaveLength(1);
    await expect(service.addLine({ ...addInput, amount: "8.0000" })).rejects.toThrow("collection_idempotency_conflict");

    const reverseRequest = randomUUID();
    const reverseInput = { orgId: orgA, actorId, lineId: lineA.id, reason: "Duplicate contribution", clientRequestId: reverseRequest };
    const [reversalA, reversalB] = await Promise.all([service.reverseLine(reverseInput), service.reverseLine(reverseInput)]);
    expect(reversalB).toEqual(reversalA);
    expect(await db.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, openedA.id))).toHaveLength(2);
    await expect(service.reverseLine({ ...reverseInput, reason: "Different correction" })).rejects.toThrow("collection_idempotency_conflict");
    await expect(service.reverseLine({ ...reverseInput, clientRequestId: randomUUID() })).rejects.toThrow("collection_line_already_reversed");
  });

  it("enforces kind/year, purpose, date, target, and beneficiary rules before insert", async () => {
    await expect(openSolidarity({ kind: "treasurer_recognition", recognitionFiscalYear: null }))
      .rejects.toThrow("collection_recognition_year_required");
    await expect(openSolidarity({ recognitionFiscalYear: 2026 }))
      .rejects.toThrow("collection_recognition_year_forbidden");
    await expect(openSolidarity({ kind: "treasurer_recognition", recognitionFiscalYear: 1999 }))
      .rejects.toThrow("collection_recognition_year_invalid");
    await expect(openSolidarity({ purpose: " x " })).rejects.toThrow("collection_purpose_invalid");
    await expect(openSolidarity({ purpose: "x".repeat(501) })).rejects.toThrow("collection_purpose_invalid");
    await expect(openSolidarity({ openedOn: "2026-02-30" })).rejects.toThrow("collection_date_invalid");
    await expect(openSolidarity({ targetAmount: "-0.0001" })).rejects.toThrow("money4_non_negative_required");
    await expect(openSolidarity({ targetAmount: "NaN" })).rejects.toThrow("money4_invalid");
    await expect(openSolidarity({ targetAmount: "100000000000000.0000" })).rejects.toThrow("money4_out_of_range");
    await expect(openSolidarity({ beneficiaryMemberId: beneficiaryB })).rejects.toThrow("collection_beneficiary_unavailable");
    await expect(openSolidarity({ beneficiaryMemberId: inactiveMemberA })).rejects.toThrow("collection_beneficiary_unavailable");
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgA))).toHaveLength(0);
  });

  it("adds mixed-account and zero lines, transitions only the first line, and emits exact audits", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const firstRequestId = randomUUID();
    const first = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10", datedOn: "2026-07-22", clientRequestId: firstRequestId,
    });
    const pending = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
      accountId: personalAccountA, amount: "7.125", datedOn: "2026-07-23", clientRequestId: randomUUID(),
    });
    const zero = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
      accountId: personalAccountA, amount: "0", datedOn: "2026-07-24", clientRequestId: randomUUID(),
    });

    expect(first).toMatchObject({ amount: "10.0000", reconciliationStatus: "regularized", accountId: groupAccountA });
    expect(pending).toMatchObject({ amount: "7.1250", reconciliationStatus: "pending", accountId: personalAccountA });
    expect(zero).toMatchObject({
      amount: "0.0000",
      reconciliationStatus: "regularized",
      accountId: personalAccountA,
    });
    const [header] = await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id));
    expect(header?.status).toBe("collecting");

    const audits = await db.select().from(auditLogEntry)
      .where(eq(auditLogEntry.orgId, orgA))
      .orderBy(auditLogEntry.createdAt, auditLogEntry.id);
    expect(audits.map((row) => row.actionKind).sort()).toEqual([
      "collection.line.added",
      "collection.line.added",
      "collection.line.added",
      "collection.opened",
      "collection.status.changed",
    ]);
    const lineAudit = audits.find((row) => row.subjectId === first.id);
    expect(lineAudit).toMatchObject({
      actionKind: "collection.line.added",
      subjectKind: "extraordinary_collection_line",
      payloadSnapshot: {
        collectionId: collection.id,
        memberId: contributorA,
        accountId: groupAccountA,
        amount: "10.0000",
        reconciliationStatus: "regularized",
        datedOn: "2026-07-22",
        clientRequestId: firstRequestId,
      },
    });
    expect(audits.find((row) => row.actionKind === "collection.status.changed")).toMatchObject({
      subjectId: collection.id,
      payloadSnapshot: { from: "open", to: "collecting", clientRequestId: firstRequestId },
    });
  });

  it("rejects invalid lines and tenant/member/account boundary violations", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const add = (overrides: Partial<Parameters<typeof service.addLine>[0]> = {}) => service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "1.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
      ...overrides,
    });

    await expect(add({ amount: "-1" })).rejects.toThrow("money4_non_negative_required");
    await expect(add({ amount: "1.00001" })).rejects.toThrow("money4_invalid");
    await expect(add({ amount: "NaN" })).rejects.toThrow("money4_invalid");
    await expect(add({ amount: "100000000000000.0000" })).rejects.toThrow("money4_out_of_range");
    await expect(add({ memberId: inactiveMemberA })).rejects.toThrow("collection_member_unavailable");
    await expect(add({ memberId: beneficiaryB })).rejects.toThrow("collection_member_unavailable");
    await expect(add({ accountId: inactiveAccountA })).rejects.toThrow("collection_account_unavailable");
    await expect(add({ accountId: groupAccountB })).rejects.toThrow("collection_account_unavailable");
    await expect(add({ orgId: orgB })).rejects.toThrow("collection_not_found");
  });

  it("appends one exact reversal and preserves the original line", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "12.3456", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    const reversalRequestId = randomUUID();
    const reversal = await service.reverseLine({
      orgId: orgA, actorId, lineId: original.id,
      reason: "  Monto digitado mal  ", clientRequestId: reversalRequestId,
    });

    expect(reversal).toMatchObject({
      collectionId: original.collectionId,
      memberId: original.memberId,
      accountId: original.accountId,
      amount: original.amount,
      reconciliationStatus: original.reconciliationStatus,
      datedOn: original.datedOn,
      reversesId: original.id,
      reverseReason: "Monto digitado mal",
    });
    const [persistedOriginal] = await db.select().from(extraordinaryCollectionLine)
      .where(eq(extraordinaryCollectionLine.id, original.id));
    expect(persistedOriginal).toEqual(original);
    const [audit] = await db.select().from(auditLogEntry).where(eq(auditLogEntry.subjectId, reversal.id));
    expect(audit).toMatchObject({
      actionKind: "collection.line.reversed",
      subjectKind: "extraordinary_collection_line",
      reason: "Monto digitado mal",
      payloadSnapshot: {
        originalLineId: original.id,
        collectionId: collection.id,
        memberId: contributorA,
        accountId: personalAccountA,
        amount: "12.3456",
        reconciliationStatus: "pending",
        datedOn: "2026-07-22",
        clientRequestId: reversalRequestId,
      },
    });
    await expect(service.reverseLine({
      orgId: orgA, actorId, lineId: original.id, reason: "Segundo intento", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_line_already_reversed");
    await expect(service.reverseLine({
      orgId: orgA, actorId, lineId: reversal.id, reason: "Reversa inválida", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_reversal_of_reversal_forbidden");
    await expect(service.reverseLine({
      orgId: orgA, actorId, lineId: original.id, reason: " muy corta ", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_reverse_reason_invalid");
  });

  it("rejects a collection-line reversal while live partial regularization exists", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "10.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    await db.insert(transfer).values({
      orgId: orgA,
      fromAccountId: personalAccountA,
      toAccountId: groupAccountA,
      amount: "4.0000",
      currencyCode: "USD",
      datedOn: "2026-07-23",
      purpose: "regularization",
      regularizesKind: "extraordinary_collection",
      regularizesId: original.id,
      createdAt: now,
      createdBy: actorId,
    });

    await expect(service.reverseLine({
      orgId: orgA,
      actorId,
      lineId: original.id,
      reason: "Correction after transfer",
      clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_line_regularization_active");
  });

  it("allows a collection-line reversal after every partial regularization is reversed", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "10.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    const [partial] = await db.insert(transfer).values({
      orgId: orgA,
      fromAccountId: personalAccountA,
      toAccountId: groupAccountA,
      amount: "4.0000",
      currencyCode: "USD",
      datedOn: "2026-07-23",
      purpose: "regularization",
      regularizesKind: "extraordinary_collection",
      regularizesId: original.id,
      createdAt: now,
      createdBy: actorId,
    }).returning();
    if (!partial) throw new Error("test_partial_regularization_not_created");
    await db.insert(transfer).values({
      orgId: orgA,
      fromAccountId: groupAccountA,
      toAccountId: personalAccountA,
      amount: "4.0000",
      currencyCode: "USD",
      datedOn: "2026-07-24",
      purpose: "regularization_reversal",
      regularizesKind: "extraordinary_collection",
      regularizesId: original.id,
      reversesId: partial.id,
      createdAt: now,
      createdBy: actorId,
    });

    await expect(service.reverseLine({
      orgId: orgA,
      actorId,
      lineId: original.id,
      reason: "Correction after reversal",
      clientRequestId: randomUUID(),
    })).resolves.toMatchObject({ reversesId: original.id });
  });

  it.each(["paid_out", "closed", "cancelled"] as const)(
    "rejects new lines and reversals after the collection is %s",
    async (status) => {
      const { collection, original } = await terminalRecognition(status);
      const service = createExtraordinaryCollectionService({ now: () => now });
      await expect(service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
        accountId: groupAccountA, amount: "1.0000", datedOn: "2026-07-23", clientRequestId: randomUUID(),
      })).rejects.toThrow("collection_not_collecting");
      await expect(service.reverseLine({
        orgId: orgA, actorId, lineId: original.id,
        reason: "Terminal correction", clientRequestId: randomUUID(),
      })).rejects.toThrow("collection_not_collecting");
      expect(await db.select().from(extraordinaryCollectionLine).where(and(
        eq(extraordinaryCollectionLine.orgId, orgA),
        eq(extraordinaryCollectionLine.collectionId, collection.id),
      ))).toHaveLength(1);
    },
  );

  it("enforces the reverse command terminal-state rule independently of the database INSERT guard", async () => {
    const { collection, original } = await terminalRecognition("paid_out");
    const service = createExtraordinaryCollectionService({ now: () => now });
    await db.execute(sql.raw(
      "DROP TRIGGER extraordinary_collection_line_insert_guard ON extraordinary_collection_line",
    ));
    try {
      await expect(service.reverseLine({
        orgId: orgA, actorId, lineId: original.id,
        reason: "Command terminal guard", clientRequestId: randomUUID(),
      })).rejects.toThrow("collection_not_collecting");
      expect(await db.select().from(extraordinaryCollectionLine).where(eq(
        extraordinaryCollectionLine.collectionId,
        collection.id,
      ))).toHaveLength(1);
    } finally {
      await db.execute(sql.raw(`
        CREATE TRIGGER extraordinary_collection_line_insert_guard
        BEFORE INSERT ON extraordinary_collection_line
        FOR EACH ROW EXECUTE FUNCTION validate_extraordinary_collection_line_insert()
      `));
    }
  });

  it.each([
    { memberInactive: true, accountArchived: false, scenario: "member became baja" },
    { memberInactive: false, accountArchived: true, scenario: "account was archived" },
    { memberInactive: true, accountArchived: true, scenario: "member and account became historical" },
  ])("reverses an exact historical line after its $scenario", async ({ memberInactive, accountArchived }) => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "3.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    if (memberInactive) {
      await db.update(member).set({ status: "baja" }).where(eq(member.id, contributorA));
    }
    if (accountArchived) {
      await db.update(account).set({ status: "archived" }).where(eq(account.id, groupAccountA));
    }

    const reversal = await service.reverseLine({
      orgId: orgA, actorId, lineId: original.id, reason: "Corrección histórica", clientRequestId: randomUUID(),
    });

    expect(reversal).toMatchObject({
      orgId: original.orgId,
      collectionId: original.collectionId,
      memberId: original.memberId,
      accountId: original.accountId,
      amount: original.amount,
      reconciliationStatus: original.reconciliationStatus,
      datedOn: original.datedOn,
      slipPhotoId: original.slipPhotoId,
      reversesId: original.id,
      reverseReason: "Corrección histórica",
    });
  });

  it("lists and gets tenant-isolated deterministic views with names and net progress", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const older = await openSolidarity({ openedOn: "2026-07-20", purpose: "Primera colecta" });
    const newer = await openSolidarity({ openedOn: "2026-07-21", purpose: "Segunda colecta" });
    await service.open({
      orgId: orgB, actorId, kind: "solidarity", purpose: "Colecta ajena",
      beneficiaryMemberId: beneficiaryB, targetAmount: null, recognitionFiscalYear: null,
      openedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const line = await service.addLine({
      orgId: orgA, actorId, collectionId: newer.id, memberId: contributorA,
      accountId: groupAccountA, amount: "4.5000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    await service.reverseLine({
      orgId: orgA, actorId, lineId: line.id, reason: "Corrección completa", clientRequestId: randomUUID(),
    });

    const views = await service.list({ orgId: orgA });
    expect(views.map((view) => view.id)).toEqual([newer.id, older.id]);
    expect(views[0]).toMatchObject({
      beneficiaryName: "Ana Beneficiaria",
      activeMemberCount: 2,
      progress: {
        contributors: 0,
        activeMembers: 2,
        collected: "0.0000",
        regularized: "0.0000",
        pending: "0.0000",
      },
      lines: [
        { id: line.id, memberName: "Bea Aportante", accountName: "Banco grupo" },
        { reversesId: line.id, memberName: "Bea Aportante", accountName: "Banco grupo" },
      ],
    });
    expect(await service.get({ orgId: orgB, collectionId: newer.id })).toBeNull();
    expect((await service.get({ orgId: orgA, collectionId: newer.id }))?.id).toBe(newer.id);
  });

  it("preserves financial lines and progress when member and account names are empty strings", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity({ purpose: "Empty display names" });
    const line = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "8.2500", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    await db.update(member).set({ displayName: "" }).where(eq(member.id, contributorA));
    await db.update(account).set({ name: "" }).where(eq(account.id, groupAccountA));

    const view = await service.get({ orgId: orgA, collectionId: collection.id });

    expect(view?.lines).toEqual([expect.objectContaining({
      id: line.id,
      memberName: "",
      accountName: "",
      amount: "8.2500",
    })]);
    expect(view?.progress).toEqual({
      contributors: 1,
      activeMembers: 2,
      collected: "8.2500",
      regularized: "8.2500",
      pending: "0.0000",
    });
  });

  it("paginates collections by the last openedOn/id item without duplicates", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const created = await Promise.all([
      openSolidarity({ openedOn: "2026-07-19", purpose: "Page one" }),
      openSolidarity({ openedOn: "2026-07-20", purpose: "Page two" }),
      openSolidarity({ openedOn: "2026-07-20", purpose: "Page three" }),
      openSolidarity({ openedOn: "2026-07-21", purpose: "Page four" }),
      openSolidarity({ openedOn: "2026-07-22", purpose: "Page five" }),
    ]);
    const expected = [...created].sort((left, right) => (
      String(right.openedOn).localeCompare(String(left.openedOn)) || right.id.localeCompare(left.id)
    ));

    const first = await service.list({ orgId: orgA, limit: 2 });
    const firstCursor = { openedOn: String(first.at(-1)?.openedOn), id: first.at(-1)?.id ?? "" };
    const second = await service.list({ orgId: orgA, limit: 2, cursor: firstCursor });
    const secondCursor = { openedOn: String(second.at(-1)?.openedOn), id: second.at(-1)?.id ?? "" };
    const third = await service.list({ orgId: orgA, limit: 2, cursor: secondCursor });
    const all = [...first, ...second, ...third];

    expect(all.map((row) => row.id)).toEqual(expected.map((row) => row.id));
    expect(new Set(all.map((row) => row.id)).size).toBe(created.length);
    await expect(service.list({ orgId: orgA, limit: 0 })).rejects.toThrow("collection_list_limit_invalid");
    await expect(service.list({ orgId: orgA, limit: 101 })).rejects.toThrow("collection_list_limit_invalid");
  });

  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-01"])(
    "rejects impossible cursor calendar date %s with a stable domain error",
    async (openedOn) => {
      const service = createExtraordinaryCollectionService({ now: () => now });
      await expect(service.list({
        orgId: orgA,
        cursor: { openedOn, id: randomUUID() },
      })).rejects.toThrow("collection_list_cursor_invalid");
    },
  );

  it("returns no torn open-header/committed-line view during a concurrent first line", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const collection = await openSolidarity({ purpose: `Snapshot ${attempt}` });
      const [views] = await Promise.all([
        service.list({ orgId: orgA, limit: 100 }),
        service.addLine({
          orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
          accountId: groupAccountA, amount: "1.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
        }),
      ]);
      const view = views.find((candidate) => candidate.id === collection.id);
      expect(view).not.toBeNull();
      expect([view?.status, view?.lines.length]).not.toEqual(["open", 1]);
      expect([["open", 0], ["collecting", 1]]).toContainEqual([view?.status, view?.lines.length]);
    }
  });

  it("serializes concurrent first lines with one transition audit and two line audits", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const requestA = randomUUID();
    const requestB = randomUUID();
    const lines = await Promise.all([
      service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
        accountId: groupAccountA, amount: "1.0000", datedOn: "2026-07-22", clientRequestId: requestA,
      }),
      service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
        accountId: personalAccountA, amount: "2.0000", datedOn: "2026-07-22", clientRequestId: requestB,
      }),
    ]);
    expect(lines).toHaveLength(2);
    const [header] = await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id));
    expect(header?.status).toBe("collecting");
    const audits = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    const related = audits.filter((row) => {
      const payload = row.payloadSnapshot as { collectionId?: string };
      return row.subjectId === collection.id || payload.collectionId === collection.id;
    });
    expect(related.filter((row) => row.actionKind === "collection.status.changed")).toHaveLength(1);
    expect(related.filter((row) => row.actionKind === "collection.line.added")).toHaveLength(2);
    expect([requestA, requestB]).toContain(
      (related.filter((row) => row.actionKind === "collection.status.changed")[0]?.payloadSnapshot as {
        clientRequestId: string;
      }).clientRequestId,
    );
    expect(related.filter((row) => row.actionKind === "collection.line.added").map((row) => (
      (row.payloadSnapshot as { clientRequestId: string }).clientRequestId
    )).sort()).toEqual([requestA, requestB].sort());
  });

  it("pays a solidarity beneficiary, returns the exact surplus, and audits every financial phase", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "30.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const clientRequestId = randomUUID();

    const closed = await service.payout({
      orgId: orgA,
      actorId,
      collectionId: collection.id,
      sourceAccountId: groupAccountA,
      payoutAmount: "25.0000",
      disposition: "returned",
      dispositionMotive: null,
      returnAccountId: personalAccountA,
      datedOn: "2026-07-22",
      clientRequestId,
    });

    expect(closed).toMatchObject({
      status: "closed",
      surplusAmount: "5.0000",
      disposition: "returned",
      dispositionMotive: null,
    });
    expect(closed.paidOutExpenseId).toBeTruthy();
    expect(closed.surplusTransferId).toBeTruthy();
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA),
      eq(expense.category, "solidarity_payout"),
    ))).toEqual([expect.objectContaining({
      id: closed.paidOutExpenseId,
      beneficiaryMemberId: beneficiaryA,
      accountId: groupAccountA,
      amount: "25.0000",
      purpose: "pago solidario",
      status: "paid",
    })]);
    expect(await db.select().from(transfer).where(and(
      eq(transfer.orgId, orgA),
      eq(transfer.purpose, "collection_surplus_return"),
    ))).toEqual([expect.objectContaining({
      id: closed.surplusTransferId,
      fromAccountId: groupAccountA,
      toAccountId: personalAccountA,
      amount: "5.0000",
      regularizesKind: "extraordinary_collection",
      regularizesId: collection.id,
      reversesId: null,
    })]);
    const audits = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    const payoutAudits = audits.filter((row) => row.subjectId === collection.id
      || row.subjectId === closed.paidOutExpenseId || row.subjectId === closed.surplusTransferId);
    expect(payoutAudits.map((row) => row.actionKind).sort()).toEqual([
      "collection.opened",
      "collection.payout.recorded",
      "collection.command.completed",
      "collection.status.changed",
      "collection.status.changed",
      "collection.status.changed",
      "collection.surplus.dispositioned",
      "collection.surplus.transferred",
    ].sort());
    expect(payoutAudits.filter((row) => (
      (row.payloadSnapshot as { clientRequestId?: string }).clientRequestId === clientRequestId
    ))).toHaveLength(6);
  });

  it("closes an exact-ceiling payout with explicit zero surplus and no disposition metadata", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "30.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });

    const closed = await service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "30.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });

    expect(closed).toMatchObject({
      status: "closed", surplusAmount: "0.0000", disposition: null,
      dispositionMotive: null, surplusTransferId: null,
    });
    expect(await db.select().from(transfer).where(eq(transfer.regularizesId, collection.id))).toHaveLength(0);
  });

  it("rejects payout from an unrelated active group account with no collection holding", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const [unrelated] = await db.insert(account).values({
      orgId: orgA, name: "Unrelated active group", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!unrelated) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });

    await expect(service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: unrelated.id,
      payoutAmount: "10.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_source_account_unavailable");
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.category, "solidarity_payout"),
    ))).toHaveLength(0);
  });

  it("pays externally deposited collection cash from its live regularization target", async () => {
    const collections = createExtraordinaryCollectionService({ now: () => now });
    const movements = createMovementService({ now: () => now });
    const collection = await openSolidarity();
    const line = await collections.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "8.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await movements.regularizePendingDeposit({
      orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: line.id,
      toAccountId: groupAccountA, amount: "8.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });

    const closed = await collections.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "8.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-23", clientRequestId: randomUUID(),
    });

    expect(await db.select().from(expense).where(eq(expense.id, closed.paidOutExpenseId as string)))
      .toEqual([expect.objectContaining({ accountId: groupAccountA, amount: "8.0000" })]);
  });

  it("enforces per-account payout cash and rejects a returned surplus split across holdings", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const [otherHolding] = await db.insert(account).values({
      orgId: orgA, name: "Split holding", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!otherHolding) throw new Error("test_account_not_created");
    const seedSplit = async () => {
      const collection = await openSolidarity();
      for (const [accountId, amount] of [[groupAccountA, "4.0000"], [otherHolding.id, "6.0000"]] as const) {
        await service.addLine({
          orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
          accountId, amount, datedOn: "2026-07-21", clientRequestId: randomUUID(),
        });
      }
      return collection;
    };
    const insufficient = await seedSplit();
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: insufficient.id, sourceAccountId: groupAccountA,
      payoutAmount: "5.0000", disposition: "retained", dispositionMotive: "Assembly retained split",
      returnAccountId: null, datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_source_account_insufficient");

    const returned = await seedSplit();
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: returned.id, sourceAccountId: groupAccountA,
      payoutAmount: "4.0000", disposition: "returned", dispositionMotive: null,
      returnAccountId: personalAccountA, datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_return_source_ambiguous");

    const retained = await seedSplit();
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: retained.id, sourceAccountId: groupAccountA,
      payoutAmount: "4.0000", disposition: "retained", dispositionMotive: "Assembly retained split",
      returnAccountId: null, datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).resolves.toMatchObject({ status: "closed", surplusAmount: "6.0000", disposition: "retained" });
  });

  it("excludes archived and reversed direct accounts from payout holdings", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const archivedCollection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: archivedCollection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "5.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await db.update(account).set({ status: "archived" }).where(eq(account.id, groupAccountA));
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: archivedCollection.id, sourceAccountId: groupAccountA,
      payoutAmount: "5.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_source_account_unavailable");
    await db.update(account).set({ status: "active" }).where(eq(account.id, groupAccountA));

    const reversedCollection = await openSolidarity();
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: reversedCollection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "5.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await service.reverseLine({
      orgId: orgA, actorId, lineId: original.id,
      reason: "Reverse direct payout holding", clientRequestId: randomUUID(),
    });
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: reversedCollection.id, sourceAccountId: groupAccountA,
      payoutAmount: "1.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_payout_exceeds_ceiling");
  });

  it("rejects pending money, over-ceiling and malformed payouts without financial writes", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
      accountId: personalAccountA, amount: "1.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const payout = (payoutAmount: string) => service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount, disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    await expect(payout("10.0000")).rejects.toThrow("collection_pending_regularization");
    await service.reverseLine({
      orgId: orgA, actorId, lineId: (await db.select().from(extraordinaryCollectionLine).where(and(
        eq(extraordinaryCollectionLine.collectionId, collection.id),
        eq(extraordinaryCollectionLine.reconciliationStatus, "pending"),
      )))[0]!.id, reason: "Remove pending amount", clientRequestId: randomUUID(),
    });
    await expect(payout("10.0001")).rejects.toThrow("collection_payout_exceeds_ceiling");
    for (const [amount, error] of [
      ["0", "collection_payout_amount_positive_required"],
      ["-0.0001", "collection_payout_amount_positive_required"],
      ["NaN", "money4_invalid"],
      ["1.00001", "money4_invalid"],
    ] as const) {
      await expect(payout(amount)).rejects.toThrow(error);
    }
    expect(await db.select().from(expense).where(eq(expense.orgId, orgA))).toHaveLength(0);
    expect(await db.select().from(transfer).where(eq(transfer.orgId, orgA))).toHaveLength(0);
  });

  it("rejects wrong kind, unavailable accounts, invalid disposition shapes, and terminal replay", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const recognition = await openSolidarity({
      kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null,
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: recognition.id, memberId: contributorA,
      accountId: groupAccountA, amount: "5.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await expect(service.payout({
      orgId: orgA, actorId, collectionId: recognition.id, sourceAccountId: groupAccountA,
      payoutAmount: "5.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_payout_kind_invalid");

    const makePayoutCollection = async () => {
      const collection = await openSolidarity();
      await service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
        accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
      });
      return collection;
    };
    const collection = await makePayoutCollection();
    const base = {
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "8.0000", disposition: "returned" as const, dispositionMotive: null,
      returnAccountId: personalAccountA, datedOn: "2026-07-22", clientRequestId: randomUUID(),
    };
    await expect(service.payout({ ...base, sourceAccountId: groupAccountB }))
      .rejects.toThrow("collection_source_account_unavailable");
    await expect(service.payout({ ...base, sourceAccountId: inactiveAccountA }))
      .rejects.toThrow("collection_source_account_unavailable");
    await expect(service.payout({ ...base, returnAccountId: personalAccountB }))
      .rejects.toThrow("collection_return_account_unavailable");
    await expect(service.payout({ ...base, returnAccountId: null }))
      .rejects.toThrow("collection_disposition_invalid");
    await expect(service.payout({ ...base, dispositionMotive: "vote" }))
      .rejects.toThrow("collection_disposition_invalid");
    await expect(service.payout({
      ...base, disposition: "retained", dispositionMotive: " x ", returnAccountId: null,
    })).rejects.toThrow("collection_disposition_invalid");
    await expect(service.payout({
      ...base, disposition: "retained", dispositionMotive: "Assembly vote", returnAccountId: personalAccountA,
    })).rejects.toThrow("collection_disposition_invalid");

    const requestId = randomUUID();
    const closed = await service.payout({ ...base, clientRequestId: requestId });
    await expect(service.payout({ ...base, clientRequestId: requestId }))
      .resolves.toMatchObject({ id: closed.id, status: "closed" });
    expect(await db.select().from(expense).where(eq(expense.id, closed.paidOutExpenseId as string))).toHaveLength(1);
    expect(await db.select().from(transfer).where(eq(transfer.id, closed.surplusTransferId as string))).toHaveLength(1);
  });

  it("cancels with one live collection source while ignoring unrelated group accounts", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "9.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const [unusedGroupAccount] = await db.insert(account).values({
      orgId: orgA, name: "Unused group account", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!unusedGroupAccount) throw new Error("test_account_not_created");
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
      accountId: unusedGroupAccount.id, amount: "0.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });

    const cancelled = await service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    });

    expect(cancelled).toMatchObject({ status: "cancelled", surplusAmount: "9.0000", disposition: "returned" });
    expect(await db.select().from(transfer).where(eq(transfer.id, cancelled.surplusTransferId as string)))
      .toEqual([expect.objectContaining({ fromAccountId: groupAccountA, toAccountId: personalAccountA, amount: "9.0000" })]);
  });

  it("returns externally deposited collection money from its live regularization target", async () => {
    const collections = createExtraordinaryCollectionService({ now: () => now });
    const movements = createMovementService({ now: () => now });
    const [returnChannel] = await db.insert(account).values({
      orgId: orgA, name: "Active return channel", type: "treasurer_personal", isGroupFund: false,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!returnChannel) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    const line = await collections.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "12.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await expect(movements.regularizePendingDeposit({
      orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: line.id,
      toAccountId: groupAccountA, amount: "12.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).resolves.toMatchObject({ regularized: true, remaining: "0.0000" });
    await db.update(account).set({ status: "archived" }).where(eq(account.id, personalAccountA));

    const cancelled = await collections.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-23",
      disposition: "returned", dispositionMotive: null, returnAccountId: returnChannel.id,
      clientRequestId: randomUUID(),
    });

    expect(cancelled).toMatchObject({ status: "cancelled", surplusAmount: "12.0000", disposition: "returned" });
    expect(await db.select().from(transfer).where(eq(transfer.id, cancelled.surplusTransferId as string)))
      .toEqual([expect.objectContaining({
        fromAccountId: groupAccountA,
        toAccountId: returnChannel.id,
        amount: "12.0000",
        purpose: "collection_surplus_return",
      })]);
  });

  it("treats direct and externally regularized lines held in the same group account as one cancellation source", async () => {
    const collections = createExtraordinaryCollectionService({ now: () => now });
    const movements = createMovementService({ now: () => now });
    const collection = await openSolidarity();
    await collections.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "5.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const external = await collections.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: beneficiaryA,
      accountId: personalAccountA, amount: "7.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await movements.regularizePendingDeposit({
      orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: external.id,
      toAccountId: groupAccountA, amount: "7.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });

    const cancelled = await collections.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-23",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    });

    expect(cancelled.surplusAmount).toBe("12.0000");
    expect(await db.select().from(transfer).where(eq(transfer.id, cancelled.surplusTransferId as string)))
      .toEqual([expect.objectContaining({ fromAccountId: groupAccountA, amount: "12.0000" })]);
  });

  it("rejects returned cancellation when external lines are held in different live regularization targets", async () => {
    const collections = createExtraordinaryCollectionService({ now: () => now });
    const movements = createMovementService({ now: () => now });
    const [returnChannel] = await db.insert(account).values({
      orgId: orgA, name: "Ambiguous holdings return channel", type: "treasurer_personal", isGroupFund: false,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    const [otherTarget] = await db.insert(account).values({
      orgId: orgA, name: "Other regularization target", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!returnChannel || !otherTarget) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    for (const [targetId, amount] of [[groupAccountA, "4.0000"], [otherTarget.id, "6.0000"]] as const) {
      const line = await collections.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
        accountId: personalAccountA, amount, datedOn: "2026-07-21", clientRequestId: randomUUID(),
      });
      await movements.regularizePendingDeposit({
        orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: line.id,
        toAccountId: targetId, amount, datedOn: "2026-07-22", clientRequestId: randomUUID(),
      });
    }
    await db.update(account).set({ status: "archived" }).where(eq(account.id, personalAccountA));

    await expect(collections.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-23",
      disposition: "returned", dispositionMotive: null, returnAccountId: returnChannel.id,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_return_source_ambiguous");
    expect(await db.select().from(transfer).where(eq(transfer.purpose, "collection_surplus_return")))
      .toHaveLength(0);
  });

  it("ignores a reversed regularization target when deriving the cancellation holding account", async () => {
    const collections = createExtraordinaryCollectionService({ now: () => now });
    const movements = createMovementService({ now: () => now });
    const [liveTarget] = await db.insert(account).values({
      orgId: orgA, name: "Live regularization target", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!liveTarget) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    const line = await collections.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const partial = await movements.regularizePendingDeposit({
      orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: line.id,
      toAccountId: groupAccountA, amount: "4.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    await db.insert(transfer).values({
      orgId: orgA, fromAccountId: groupAccountA, toAccountId: personalAccountA,
      amount: "4.0000", currencyCode: "USD", datedOn: "2026-07-22",
      purpose: "regularization_reversal", regularizesKind: "extraordinary_collection",
      regularizesId: line.id, reversesId: partial.transfer.id, createdAt: now, createdBy: actorId,
    });
    await movements.regularizePendingDeposit({
      orgId: orgA, actorId, regularizesKind: "extraordinary_collection", regularizesId: line.id,
      toAccountId: liveTarget.id, amount: "10.0000", datedOn: "2026-07-23", clientRequestId: randomUUID(),
    });

    const cancelled = await collections.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-24",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    });

    expect(await db.select().from(transfer).where(eq(transfer.id, cancelled.surplusTransferId as string)))
      .toEqual([expect.objectContaining({ fromAccountId: liveTarget.id, amount: "10.0000" })]);
  });

  it("rejects returned cancellation across multiple live source accounts but permits retained", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const [otherSource] = await db.insert(account).values({
      orgId: orgA, name: "Second collection account", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!otherSource) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    for (const [accountId, amount] of [[groupAccountA, "4.0000"], [otherSource.id, "6.0000"]] as const) {
      await service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
        accountId, amount, datedOn: "2026-07-21", clientRequestId: randomUUID(),
      });
    }
    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_return_source_ambiguous");

    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "retained", dispositionMotive: "Assembly retained surplus", returnAccountId: null,
      clientRequestId: randomUUID(),
    })).resolves.toMatchObject({
      status: "cancelled", surplusAmount: "10.0000", disposition: "retained",
      dispositionMotive: "Assembly retained surplus", surplusTransferId: null,
    });
  });

  it("keeps an archived direct holding in source multiplicity and rejects return from the other account", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const [otherSource] = await db.insert(account).values({
      orgId: orgA, name: "Other active direct holding", type: "group_bank", isGroupFund: true,
      status: "active", createdAt: now, createdBy: actorId, clientRequestId: randomUUID(),
    }).returning();
    if (!otherSource) throw new Error("test_account_not_created");
    const collection = await openSolidarity();
    for (const [accountId, amount] of [[groupAccountA, "4.0000"], [otherSource.id, "6.0000"]] as const) {
      await service.addLine({
        orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
        accountId, amount, datedOn: "2026-07-21", clientRequestId: randomUUID(),
      });
    }
    await db.update(account).set({ status: "archived" }).where(eq(account.id, groupAccountA));

    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_return_source_ambiguous");
    expect(await db.select().from(transfer).where(eq(transfer.purpose, "collection_surplus_return")))
      .toHaveLength(0);
  });

  it("rejects a sole archived direct holding as unavailable after resolving it uniquely", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await db.update(account).set({ status: "archived" }).where(eq(account.id, groupAccountA));

    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_return_source_unavailable");
    expect(await db.select().from(transfer).where(eq(transfer.purpose, "collection_surplus_return")))
      .toHaveLength(0);
  });

  it("cancels a zero-fund open collection without resolving a source or disposition", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: null, dispositionMotive: null, returnAccountId: null, clientRequestId: randomUUID(),
    })).resolves.toMatchObject({
      status: "cancelled", surplusAmount: "0.0000", disposition: null,
      dispositionMotive: null, surplusTransferId: null,
    });
  });

  it("rejects cancellation with effective pending money, invalid surplus metadata, or terminal state", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: personalAccountA, amount: "3.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const cancel = (overrides: Partial<Parameters<typeof service.cancel>[0]> = {}) => service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "retained", dispositionMotive: "Assembly cancellation vote", returnAccountId: null,
      clientRequestId: randomUUID(), ...overrides,
    });
    await expect(cancel()).rejects.toThrow("collection_pending_regularization");
    const [pending] = await db.select().from(extraordinaryCollectionLine).where(eq(
      extraordinaryCollectionLine.collectionId, collection.id,
    ));
    await service.reverseLine({
      orgId: orgA, actorId, lineId: pending!.id, reason: "Remove pending deposit", clientRequestId: randomUUID(),
    });
    await expect(cancel()).rejects.toThrow("collection_disposition_invalid");
    const cancelled = await cancel({ disposition: null, dispositionMotive: null, returnAccountId: null });
    expect(cancelled.status).toBe("cancelled");
    await expect(cancel({ disposition: null, dispositionMotive: null, returnAccountId: null }))
      .rejects.toThrow("collection_not_cancellable");
  });

  it("closes positive recognition through paid_out as retained with no expense", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity({
      kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null,
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "17.2500", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const clientRequestId = randomUUID();

    const closed = await service.closeRecognition({
      orgId: orgA, actorId, collectionId: collection.id,
      dispositionMotive: "  Assembly recognition vote  ", clientRequestId,
    });

    expect(closed).toMatchObject({
      status: "closed", paidOutExpenseId: null, surplusAmount: "17.2500",
      disposition: "retained", dispositionMotive: "Assembly recognition vote", surplusTransferId: null,
    });
    expect(await db.select().from(expense).where(eq(expense.orgId, orgA))).toHaveLength(0);
    const audits = await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA), eq(auditLogEntry.subjectId, collection.id),
    ));
    expect(audits.filter((row) => (
      (row.payloadSnapshot as { clientRequestId?: string }).clientRequestId === clientRequestId
    )).map((row) => row.actionKind).sort()).toEqual([
      "collection.command.completed", "collection.status.changed", "collection.status.changed", "collection.surplus.dispositioned",
    ].sort());
  });

  it("rejects recognition close for wrong kind, nonpositive regularized money, pending money, and invalid motive", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const solidarity = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: solidarity.id, memberId: contributorA,
      accountId: groupAccountA, amount: "1.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await expect(service.closeRecognition({
      orgId: orgA, actorId, collectionId: solidarity.id,
      dispositionMotive: "Assembly vote", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_recognition_kind_required");

    const empty = await openSolidarity({
      kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null,
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: empty.id, memberId: contributorA,
      accountId: groupAccountA, amount: "0.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await expect(service.closeRecognition({
      orgId: orgA, actorId, collectionId: empty.id,
      dispositionMotive: "Assembly vote", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_recognition_amount_positive_required");
    await expect(service.closeRecognition({
      orgId: orgA, actorId, collectionId: empty.id,
      dispositionMotive: " x ", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_disposition_invalid");

    const pending = await openSolidarity({
      kind: "treasurer_recognition", recognitionFiscalYear: 2027, targetAmount: null,
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: pending.id, memberId: contributorA,
      accountId: personalAccountA, amount: "4.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await expect(service.closeRecognition({
      orgId: orgA, actorId, collectionId: pending.id,
      dispositionMotive: "Assembly vote", clientRequestId: randomUUID(),
    })).rejects.toThrow("collection_pending_regularization");
  });

  it("serializes concurrent payouts so exactly one closes and one expense survives", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "20.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const payout = (clientRequestId: string) => service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "20.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId,
    });

    const outcomes = await Promise.allSettled([payout(randomUUID()), payout(randomUUID())]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(String((outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult).reason))
      .toContain("collection_not_collecting");
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.category, "solidarity_payout"),
    ))).toHaveLength(1);
  });

  it.each([
    { command: "cancel" as const, openedOn: "2026-07-01", lineOn: "2026-07-20", terminalOn: "2026-07-01", error: "collection_terminal_date_before_line" },
    { command: "payout" as const, openedOn: "2026-07-01", lineOn: "2026-07-20", terminalOn: "2026-07-01", error: "collection_terminal_date_before_line" },
    { command: "cancel" as const, openedOn: "2026-07-21", lineOn: "2026-07-22", terminalOn: "2026-07-20", error: "collection_terminal_date_before_opened" },
    { command: "payout" as const, openedOn: "2026-07-21", lineOn: "2026-07-22", terminalOn: "2026-07-20", error: "collection_terminal_date_before_opened" },
  ])("rejects a $command terminal date before collection chronology with no writes", async (scenario) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity({ openedOn: scenario.openedOn });
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: scenario.lineOn,
      clientRequestId: randomUUID(),
    });
    const before = {
      audits: (await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA))).length,
      expenses: (await db.select().from(expense).where(eq(expense.orgId, orgA))).length,
      transfers: (await db.select().from(transfer).where(eq(transfer.orgId, orgA))).length,
    };
    const command = scenario.command === "cancel"
      ? service.cancel({
        orgId: orgA, actorId, collectionId: collection.id, datedOn: scenario.terminalOn,
        disposition: "retained", dispositionMotive: "Chronology vote", returnAccountId: null,
        clientRequestId: randomUUID(),
      })
      : service.payout({
        orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
        payoutAmount: "5.0000", datedOn: scenario.terminalOn,
        disposition: "retained", dispositionMotive: "Chronology vote", returnAccountId: null,
        clientRequestId: randomUUID(),
      });

    await expect(command).rejects.toThrow(scenario.error);
    expect({
      audits: (await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA))).length,
      expenses: (await db.select().from(expense).where(eq(expense.orgId, orgA))).length,
      transfers: (await db.select().from(transfer).where(eq(transfer.orgId, orgA))).length,
    }).toEqual(before);
    expect(await db.select({ status: extraordinaryCollection.status }).from(extraordinaryCollection)
      .where(eq(extraordinaryCollection.id, collection.id))).toEqual([{ status: "collecting" }]);
  });

  it.each([
    { payoutAmount: "10.0000", disposition: null, dispositionMotive: null, returnAccountId: null },
    { payoutAmount: "8.0000", disposition: "retained" as const, dispositionMotive: "Assembly replay vote", returnAccountId: null },
    { payoutAmount: "8.0000", disposition: "returned" as const, dispositionMotive: null, returnAccountId: "return" },
  ])("replays an equivalent $disposition payout with one write set", async (shape) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const clientRequestId = randomUUID();
    const input = {
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: shape.payoutAmount, disposition: shape.disposition,
      dispositionMotive: shape.dispositionMotive,
      returnAccountId: shape.returnAccountId === "return" ? personalAccountA : null,
      datedOn: "2026-07-22", clientRequestId,
    };

    const [first, replay] = await Promise.all([service.payout(input), service.payout(input)]);

    expect(replay.id).toBe(first.id);
    expect(await db.select().from(expense).where(and(
      eq(expense.orgId, orgA), eq(expense.clientRequestId, clientRequestId),
    ))).toHaveLength(1);
    expect(await db.select().from(transfer).where(and(
      eq(transfer.orgId, orgA), eq(transfer.clientRequestId, clientRequestId),
    ))).toHaveLength(shape.disposition === "returned" ? 1 : 0);
    const completed = (await db.select().from(auditLogEntry).where(and(
      eq(auditLogEntry.orgId, orgA), eq(auditLogEntry.actionKind, "collection.command.completed"),
    ))).filter((row) => (row.payloadSnapshot as { clientRequestId?: string }).clientRequestId === clientRequestId);
    expect(completed).toHaveLength(1);
    const projection = await db.execute<{
      beforeReclassification: string; onReclassification: string;
      beforeCore: string; beforeCollection: string; beforePhysical: string;
      onCore: string; onCollection: string; onPhysical: string;
    }>(sql`SELECT
      retained_collection_reclassification(${orgA}, '2026-07-21') AS "beforeReclassification",
      retained_collection_reclassification(${orgA}, '2026-07-22') AS "onReclassification",
      fund_pool_balance(${orgA}, '2026-07-21') AS "beforeCore",
      collection_cash_balance(${orgA}, '2026-07-21') AS "beforeCollection",
      physical_cash_balance(${orgA}, '2026-07-21') AS "beforePhysical",
      fund_pool_balance(${orgA}, '2026-07-22') AS "onCore",
      collection_cash_balance(${orgA}, '2026-07-22') AS "onCollection",
      physical_cash_balance(${orgA}, '2026-07-22') AS "onPhysical"`);
    const [balances] = Array.isArray(projection) ? projection : projection.rows ?? [];
    expect(balances).toEqual({
      beforeReclassification: "0.0000",
      onReclassification: shape.disposition === "retained" ? "2.0000" : "0.0000",
      beforeCore: "0.0000",
      beforeCollection: "10.0000",
      beforePhysical: "10.0000",
      onCore: shape.disposition === "retained" ? "2.0000" : "0.0000",
      onCollection: "0.0000",
      onPhysical: shape.disposition === "retained" ? "2.0000" : "0.0000",
    });
  });

  it("rejects payout replay conflicts while preserving terminal error for a different request", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const clientRequestId = randomUUID();
    const input = {
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "10.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId,
    };
    await service.payout(input);
    await expect(service.payout({ ...input, payoutAmount: "9.0000", disposition: "retained", dispositionMotive: "Conflict vote" }))
      .rejects.toThrow("collection_idempotency_conflict");
    await expect(service.payout({ ...input, clientRequestId: randomUUID() }))
      .rejects.toThrow("collection_not_collecting");
  });

  it("appends and idempotently replays an exact governed payout reversal", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const closed = await service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "10.0000", disposition: null, dispositionMotive: null, returnAccountId: null,
      datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    const clientRequestId = randomUUID();
    const input = {
      orgId: orgA, actorId, collectionId: collection.id,
      reason: "Beneficiary payment correction", datedOn: "2026-07-23", clientRequestId,
    };

    const reversed = await service.reversePayout(input);
    const replay = await service.reversePayout(input);

    expect(replay.id).toBe(reversed.id);
    expect(reversed).toMatchObject({
      orgId: orgA,
      purpose: "reversal: pago solidario",
      amount: "10.0000",
      currencyCode: "USD",
      beneficiaryMemberId: beneficiaryA,
      incurredOn: "2026-07-23",
      status: "paid",
      reversesId: closed.paidOutExpenseId,
      reverseReason: "Beneficiary payment correction",
      accountId: groupAccountA,
      category: "solidarity_payout",
      clientRequestId,
    });
    expect(await db.select().from(expense).where(eq(expense.reversesId, closed.paidOutExpenseId as string)))
      .toHaveLength(1);
    const audits = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    expect(audits.filter((row) => row.actionKind === "collection.payout.reversed" && row.subjectId === reversed.id))
      .toHaveLength(1);
    expect(audits.filter((row) => row.actionKind === "collection.command.completed" && (
      (row.payloadSnapshot as { clientRequestId?: string }).clientRequestId === clientRequestId
    ))).toHaveLength(1);
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id)))
      .toEqual([expect.objectContaining({ status: "closed", paidOutExpenseId: closed.paidOutExpenseId })]);
    await expect(service.reversePayout({ ...input, reason: "A different correction reason" }))
      .rejects.toThrow("collection_idempotency_conflict");
    await expect(service.reversePayout({ ...input, clientRequestId: randomUUID() }))
      .rejects.toThrow("collection_payout_already_reversed");
  });

  it("rejects payout reversal without an eligible closed solidarity payout", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const open = await openSolidarity();
    const base = {
      orgId: orgA, actorId, collectionId: open.id,
      reason: "Valid correction reason", datedOn: "2026-07-23", clientRequestId: randomUUID(),
    };
    await expect(service.reversePayout({ ...base, reason: " too short " }))
      .rejects.toThrow("collection_payout_reverse_reason_invalid");
    await expect(service.reversePayout(base)).rejects.toThrow("collection_payout_not_reversible");
    await expect(service.reversePayout({ ...base, orgId: orgB }))
      .rejects.toThrow("collection_not_found");

    const recognition = await openSolidarity({ kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null });
    await service.addLine({
      orgId: orgA, actorId, collectionId: recognition.id, memberId: contributorA,
      accountId: groupAccountA, amount: "2.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await service.closeRecognition({
      orgId: orgA, actorId, collectionId: recognition.id,
      dispositionMotive: "Recognition correction vote", clientRequestId: randomUUID(),
    });
    await expect(service.reversePayout({ ...base, collectionId: recognition.id, clientRequestId: randomUUID() }))
      .rejects.toThrow("collection_payout_kind_invalid");
  });

  it.each([
    { amount: "0.0000", disposition: null, dispositionMotive: null, returnAccountId: null },
    { amount: "6.0000", disposition: "retained" as const, dispositionMotive: "Cancel replay vote", returnAccountId: null },
    { amount: "6.0000", disposition: "returned" as const, dispositionMotive: null, returnAccountId: "return" },
  ])("replays equivalent $disposition cancellation and recognition commands", async (shape) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const cancellation = await openSolidarity();
    if (shape.amount !== "0.0000") {
      await service.addLine({
        orgId: orgA, actorId, collectionId: cancellation.id, memberId: contributorA,
        accountId: groupAccountA, amount: shape.amount, datedOn: "2026-07-21", clientRequestId: randomUUID(),
      });
    }
    const cancelRequestId = randomUUID();
    const cancelInput = {
      orgId: orgA, actorId, collectionId: cancellation.id, datedOn: "2026-07-22",
      disposition: shape.disposition, dispositionMotive: shape.dispositionMotive,
      returnAccountId: shape.returnAccountId === "return" ? personalAccountA : null,
      clientRequestId: cancelRequestId,
    };
    const cancelled = await service.cancel(cancelInput);
    expect((await service.cancel(cancelInput)).id).toBe(cancelled.id);

    const recognition = await openSolidarity({ kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null });
    await service.addLine({
      orgId: orgA, actorId, collectionId: recognition.id, memberId: contributorA,
      accountId: groupAccountA, amount: "3.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const recognitionInput = {
      orgId: orgA, actorId, collectionId: recognition.id,
      dispositionMotive: "Recognition replay vote", clientRequestId: randomUUID(),
    };
    const recognized = await service.closeRecognition(recognitionInput);
    expect((await service.closeRecognition(recognitionInput)).id).toBe(recognized.id);
  });

  it("rejects cancellation and recognition idempotency conflicts", async () => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const cancellation = await openSolidarity();
    const cancelInput = {
      orgId: orgA, actorId, collectionId: cancellation.id, datedOn: "2026-07-22",
      disposition: null, dispositionMotive: null, returnAccountId: null, clientRequestId: randomUUID(),
    };
    await service.cancel(cancelInput);
    await expect(service.cancel({ ...cancelInput, datedOn: "2026-07-23" }))
      .rejects.toThrow("collection_idempotency_conflict");
    await expect(service.cancel({ ...cancelInput, clientRequestId: randomUUID() }))
      .rejects.toThrow("collection_not_cancellable");

    const recognition = await openSolidarity({ kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null });
    await service.addLine({
      orgId: orgA, actorId, collectionId: recognition.id, memberId: contributorA,
      accountId: groupAccountA, amount: "3.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    const recognitionInput = {
      orgId: orgA, actorId, collectionId: recognition.id,
      dispositionMotive: "Recognition conflict vote", clientRequestId: randomUUID(),
    };
    await service.closeRecognition(recognitionInput);
    await expect(service.closeRecognition({ ...recognitionInput, dispositionMotive: "Different recognition vote" }))
      .rejects.toThrow("collection_idempotency_conflict");
    await expect(service.closeRecognition({ ...recognitionInput, clientRequestId: randomUUID() }))
      .rejects.toThrow("collection_not_collecting");
  });

  it.each([
    { actionKind: "collection.payout.recorded", transitionTo: undefined },
    { actionKind: "collection.status.changed", transitionTo: "paid_out" },
    { actionKind: "collection.surplus.transferred", transitionTo: undefined },
    { actionKind: "collection.status.changed", transitionTo: "closed" },
    { actionKind: "collection.surplus.dispositioned", transitionTo: undefined },
    { actionKind: "collection.command.completed", transitionTo: undefined },
  ])("rolls back the complete payout when the $actionKind/$transitionTo audit fails", async ({ actionKind, transitionTo }) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "10.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await installAuditFailure(actionKind, transitionTo);

    await expect(service.payout({
      orgId: orgA, actorId, collectionId: collection.id, sourceAccountId: groupAccountA,
      payoutAmount: "8.0000", disposition: "returned", dispositionMotive: null,
      returnAccountId: personalAccountA, datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");

    expect(await db.select().from(expense).where(eq(expense.orgId, orgA))).toHaveLength(0);
    expect(await db.select().from(transfer).where(eq(transfer.orgId, orgA))).toHaveLength(0);
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id)))
      .toEqual([expect.objectContaining({ status: "collecting", paidOutExpenseId: null, surplusAmount: null })]);
  });

  it.each([
    "collection.surplus.transferred",
    "collection.status.changed",
    "collection.surplus.dispositioned",
    "collection.command.completed",
  ])("rolls back cancellation when the %s audit fails", async (actionKind) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity();
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "7.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await installAuditFailure(actionKind, actionKind === "collection.status.changed" ? "cancelled" : undefined);
    await expect(service.cancel({
      orgId: orgA, actorId, collectionId: collection.id, datedOn: "2026-07-22",
      disposition: "returned", dispositionMotive: null, returnAccountId: personalAccountA,
      clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");
    expect(await db.select().from(transfer).where(eq(transfer.orgId, orgA))).toHaveLength(0);
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id)))
      .toEqual([expect.objectContaining({ status: "collecting", surplusAmount: null })]);
  });

  it.each([
    { actionKind: "collection.status.changed", transitionTo: "paid_out" },
    { actionKind: "collection.status.changed", transitionTo: "closed" },
    { actionKind: "collection.surplus.dispositioned", transitionTo: undefined },
    { actionKind: "collection.command.completed", transitionTo: undefined },
  ])("rolls back recognition close when the $actionKind/$transitionTo audit fails", async ({ actionKind, transitionTo }) => {
    const service = createExtraordinaryCollectionService({ now: () => now });
    const collection = await openSolidarity({
      kind: "treasurer_recognition", recognitionFiscalYear: 2026, targetAmount: null,
    });
    await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "11.0000", datedOn: "2026-07-21", clientRequestId: randomUUID(),
    });
    await installAuditFailure(actionKind, transitionTo);
    await expect(service.closeRecognition({
      orgId: orgA, actorId, collectionId: collection.id,
      dispositionMotive: "Assembly recognition", clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id)))
      .toEqual([expect.objectContaining({ status: "collecting", surplusAmount: null })]);
  });

  it("rolls back an opened collection when its audit fails", async () => {
    await installAuditFailure("collection.opened");
    await expect(openSolidarity()).rejects.toThrow("forced collection audit failure");
    expect(await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.orgId, orgA)))
      .toHaveLength(0);
    expect(await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA))).toHaveLength(0);
  });

  it("rolls back an added line when its line audit fails", async () => {
    const collection = await openSolidarity();
    const auditsBefore = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    await installAuditFailure("collection.line.added");
    const service = createExtraordinaryCollectionService({ now: () => now });
    await expect(service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "9.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");
    expect(await db.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id)))
      .toHaveLength(0);
    const [header] = await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id));
    expect(header?.status).toBe("open");
    expect(await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA))).toHaveLength(auditsBefore.length);
  });

  it("rolls back a reversal when its audit fails", async () => {
    const collection = await openSolidarity();
    const service = createExtraordinaryCollectionService({ now: () => now });
    const original = await service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "9.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    });
    const auditsBefore = await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA));
    await installAuditFailure("collection.line.reversed");
    await expect(service.reverseLine({
      orgId: orgA, actorId, lineId: original.id,
      reason: "Audit reversal failure", clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");
    const lines = await db.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id));
    expect(lines).toEqual([original]);
    expect(await db.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, orgA))).toHaveLength(auditsBefore.length);
  });

  it("rolls back the line and first-line transition when its audit write fails", async () => {
    const collection = await openSolidarity();
    await installAuditFailure("collection.status.changed");
    const service = createExtraordinaryCollectionService({ now: () => now });

    await expect(service.addLine({
      orgId: orgA, actorId, collectionId: collection.id, memberId: contributorA,
      accountId: groupAccountA, amount: "9.0000", datedOn: "2026-07-22", clientRequestId: randomUUID(),
    })).rejects.toThrow("forced collection audit failure");

    expect(await db.select().from(extraordinaryCollectionLine).where(eq(extraordinaryCollectionLine.collectionId, collection.id)))
      .toHaveLength(0);
    const [header] = await db.select().from(extraordinaryCollection).where(eq(extraordinaryCollection.id, collection.id));
    expect(header?.status).toBe("open");
  });
});
