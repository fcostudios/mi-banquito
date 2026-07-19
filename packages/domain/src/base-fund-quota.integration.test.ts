import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogEntry,
  baseFundQuotaConfig,
  baseFundQuotaPayment,
  member,
  organization,
  slipPhoto,
} from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile("../../apps/web/.env.local");
  } catch {
    // beforeAll reports the actionable configuration error.
  }
}

const ORG_ID = randomUUID();
const MEMBER_ID = randomUUID();
const ACTOR_ID = randomUUID();
const SLIP_ID = randomUUID();
const FISCAL_YEAR = 2026;

let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createLedgerService: typeof import("./ledger")["createLedgerService"];

describe("base-fund quota invariants with Postgres", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for base-fund quota integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createLedgerService } = await import("./ledger"));
    await db.insert(organization).values({
      id: ORG_ID,
      displayName: "Base fund quota test",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-07-18T12:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.insert(member).values({
        id: MEMBER_ID,
        orgId: ORG_ID,
        displayName: "Ana",
        joinedOn: "2026-01-01",
        role: "aportante",
        status: "activo",
        initialSavingsBalance: "0.0000",
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "member",
      });
    });
  });

  afterAll(async () => {
    if (!db || !withTenantTransaction) return;
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_ID));
      await tx.delete(baseFundQuotaPayment).where(eq(baseFundQuotaPayment.orgId, ORG_ID));
      await tx.delete(slipPhoto).where(eq(slipPhoto.orgId, ORG_ID));
      await tx.delete(baseFundQuotaConfig).where(eq(baseFundQuotaConfig.orgId, ORG_ID));
      await tx.delete(member).where(eq(member.orgId, ORG_ID));
    });
    await db.delete(organization).where(eq(organization.id, ORG_ID));
  });

  it("requires fiscal-year configuration and rejects a duplicate member/year payment without overwriting", async () => {
    const service = createLedgerService();
    const payment = {
      memberId: MEMBER_ID,
      fiscalYear: FISCAL_YEAR,
      amount: "25.0000",
      paidOn: "2026-07-18",
      slipPhotoId: SLIP_ID,
      slipPhoto: {
        id: SLIP_ID,
        uri: "https://private.blob.invalid/base-fund-quota.jpg",
        mimeType: "image/jpeg" as const,
        byteSize: 1024,
        contentHash: "a".repeat(64),
      },
    };

    await expect(service.recordBaseFundQuotaPayment(ORG_ID, ACTOR_ID, payment))
      .rejects.toThrow("base_fund_quota_config_required");

    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.insert(baseFundQuotaConfig).values({
        orgId: ORG_ID,
        fiscalYear: FISCAL_YEAR,
        perMemberAmount: "25.0000",
        currencyCode: "USD",
        createdAt: new Date("2026-07-18T12:00:00.000Z"),
        createdBy: ACTOR_ID,
        createdByKind: "member",
      });
    });

    await service.recordBaseFundQuotaPayment(ORG_ID, ACTOR_ID, payment);
    await expect(service.recordBaseFundQuotaPayment(ORG_ID, ACTOR_ID, {
      ...payment,
      amount: "30.0000",
      slipPhotoId: "",
      slipPhoto: undefined,
    }))
      .rejects.toMatchObject({ code: "23505" });

    const { payments, audits, slips } = await withTenantTransaction(ORG_ID, async (tx) => ({
      payments: await tx.select().from(baseFundQuotaPayment).where(eq(baseFundQuotaPayment.orgId, ORG_ID)),
      audits: await tx.select().from(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_ID)),
      slips: await tx.select().from(slipPhoto).where(eq(slipPhoto.orgId, ORG_ID)),
    }));
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe("25.0000");
    expect(slips).toEqual([expect.objectContaining({
      id: SLIP_ID,
      attachedToKind: "base_fund_quota_payment",
      attachedToId: payments[0]?.id,
    })]);
    expect(audits.filter((row) => row.actionKind === "base_fund_quota.payment")).toHaveLength(1);
  });
});
