import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { alert, alertAction, organization } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try { loadEnvFile("../../apps/web/.env.local"); } catch { /* reported in beforeAll */ }
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ACTOR_ID = randomUUID();
const NOW = new Date("2026-07-02T11:00:00.000Z");
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let createAlertsService: typeof import("./alerts")["createAlertsService"];

async function seedAlert(input: { orgId: string; alertKind: string }) {
  const [row] = await withTenantTransaction(input.orgId, (tx) => tx.insert(alert).values({
    orgId: input.orgId,
    alertKind: input.alertKind,
    severity: "high",
    audience: "treasurer",
    subjectKind: "year_end_share_out",
    subjectId: randomUUID(),
    payload: { title: input.alertKind, body: `${input.alertKind} body`, year: 2026 },
    dedupWindowEnd: new Date("2026-07-09T11:00:00.000Z"),
    createdAt: NOW,
  }).returning());
  if (!row) throw new Error("test_alert_not_created");
  return row;
}

describe("active tenant-scoped A5 alert reads", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for alert integration tests");
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    ({ createAlertsService } = await import("./alerts"));
    await db.insert(organization).values([
      {
        id: ORG_A, displayName: "A5 read A", countryCode: "EC", currencyCode: "USD",
        timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
        createdAt: NOW, createdBy: ACTOR_ID, createdByKind: "system",
      },
      {
        id: ORG_B, displayName: "A5 read B", countryCode: "EC", currencyCode: "USD",
        timezone: "America/Guayaquil", defaultLanguage: "es-EC", status: "active",
        createdAt: NOW, createdBy: ACTOR_ID, createdByKind: "system",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    for (const orgId of [ORG_A, ORG_B]) {
      await withTenantTransaction(orgId, async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.delete(alertAction).where(eq(alertAction.orgId, orgId));
        await tx.delete(alert).where(eq(alert.orgId, orgId));
      });
    }
    await db.delete(organization).where(eq(organization.id, ORG_A));
    await db.delete(organization).where(eq(organization.id, ORG_B));
  });

  it("returns active A5 while excluding another tenant and dismissed, snoozed, and non-A5 records", async () => {
    const activeA5 = await seedAlert({ orgId: ORG_A, alertKind: "A5" });
    const dismissedA5 = await seedAlert({ orgId: ORG_A, alertKind: "A5" });
    const snoozedA5 = await seedAlert({ orgId: ORG_A, alertKind: "A5" });
    const activeA4 = await seedAlert({ orgId: ORG_A, alertKind: "A4" });
    const otherTenantA5 = await seedAlert({ orgId: ORG_B, alertKind: "A5" });
    await withTenantTransaction(ORG_A, async (tx) => {
      await tx.insert(alertAction).values([
        {
          orgId: ORG_A, alertId: dismissedA5.id, actionKind: "dismiss", snoozedUntil: null,
          actorId: ACTOR_ID, actorKind: "member", reason: "resolved", createdAt: NOW,
        },
        {
          orgId: ORG_A, alertId: snoozedA5.id, actionKind: "snooze",
          snoozedUntil: new Date("2026-07-03T11:00:00.000Z"), actorId: ACTOR_ID,
          actorKind: "member", reason: null, createdAt: NOW,
        },
      ]);
    });

    const visible = await createAlertsService().listVisibleAlerts({
      orgId: ORG_A,
      audience: "treasurer",
      now: new Date("2026-07-02T12:00:00.000Z"),
    });

    expect(visible.map((row) => row.id)).toEqual(expect.arrayContaining([activeA5.id, activeA4.id]));
    expect(visible.map((row) => row.id)).not.toContain(dismissedA5.id);
    expect(visible.map((row) => row.id)).not.toContain(snoozedA5.id);
    expect(visible.map((row) => row.id)).not.toContain(otherTenantA5.id);
    expect(visible.filter((row) => row.alertKind === "A5").map((row) => row.id)).toEqual([activeA5.id]);
    expect(visible.find((row) => row.id === activeA5.id)?.payload).toMatchObject({ year: 2026 });
  });
});
