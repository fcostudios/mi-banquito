import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { account, auditLogEntry, organization } from "@mi-banquito/db/schema";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {
    // beforeAll reports the required configuration explicitly.
  }
}

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    async getSession() {
      return null;
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const ORG_ID = randomUUID();
const ACTOR_ID = randomUUID();
let db: typeof import("@mi-banquito/db")["db"];
let withTenantTransaction: typeof import("@mi-banquito/db/tenant")["withTenantTransaction"];
let saveAccountAction: typeof import("./actions")["saveAccountAction"];
const originalBypass = process.env.E2E_AUTH_BYPASS;
const originalOrgId = process.env.AUTH0_ORGANIZATION_DB_ORG_ID;

function validFormData(clientRequestId = randomUUID()) {
  const formData = new FormData();
  formData.set("clientRequestId", clientRequestId);
  formData.set("name", "Banco de acciones");
  formData.set("type", "group_bank");
  formData.set("isGroupFund", "");
  formData.set("last4", "4821");
  return formData;
}

function redirectPath(error: unknown): string {
  if (typeof error === "object" && error !== null && "digest" in error) {
    return String(error.digest);
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRedirect(run: () => Promise<unknown>, path: string) {
  try {
    await run();
    throw new Error("expected redirect");
  } catch (error) {
    expect(redirectPath(error)).toContain(path);
  }
}

describe("account server actions", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for cuentas action integration tests");
    }
    ({ db } = await import("@mi-banquito/db"));
    ({ withTenantTransaction } = await import("@mi-banquito/db/tenant"));
    await db.insert(organization).values({
      id: ORG_ID,
      displayName: "Accounts actions test",
      countryCode: "EC",
      currencyCode: "USD",
      timezone: "America/Guayaquil",
      defaultLanguage: "es-EC",
      status: "active",
      createdAt: new Date("2026-07-11T12:00:00.000Z"),
      createdBy: ACTOR_ID,
      createdByKind: "system",
    });
    process.env.AUTH0_ORGANIZATION_DB_ORG_ID = ORG_ID;
    process.env.E2E_AUTH_BYPASS = "1";
    ({ saveAccountAction } = await import("./actions"));
  });

  beforeEach(async () => {
    process.env.E2E_AUTH_BYPASS = "1";
    await withTenantTransaction(ORG_ID, async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.delete(auditLogEntry).where(eq(auditLogEntry.orgId, ORG_ID));
      await tx.delete(account).where(eq(account.orgId, ORG_ID));
    });
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, ORG_ID));
    if (originalBypass === undefined) delete process.env.E2E_AUTH_BYPASS;
    else process.env.E2E_AUTH_BYPASS = originalBypass;
    if (originalOrgId === undefined) delete process.env.AUTH0_ORGANIZATION_DB_ORG_ID;
    else process.env.AUTH0_ORGANIZATION_DB_ORG_ID = originalOrgId;
  });

  it("creates once when an authorized treasurer replays the same request", async () => {
    const clientRequestId = randomUUID();
    await expectRedirect(() => saveAccountAction(validFormData(clientRequestId)), "/cuentas?saved=created");
    await expectRedirect(() => saveAccountAction(validFormData(clientRequestId)), "/cuentas?saved=created");

    const rows = await withTenantTransaction(ORG_ID, (tx) =>
      tx.select().from(account).where(eq(account.orgId, ORG_ID)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientRequestId, name: "Banco de acciones" });
  });

  it("accepts the React server-action metadata included by native browser submissions", async () => {
    const formData = validFormData();
    formData.set("$ACTION_ID_saveAccountAction", "");

    await expectRedirect(() => saveAccountAction(formData), "/cuentas?saved=created");

    const rows = await withTenantTransaction(ORG_ID, (tx) =>
      tx.select().from(account).where(eq(account.orgId, ORG_ID)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Banco de acciones", type: "group_bank" });
  });

  it.each([
    ["File scalar", (formData: FormData) => formData.set("name", new File(["Banco"], "name.txt", { type: "text/plain" }))],
    ["missing request UUID", (formData: FormData) => formData.delete("clientRequestId")],
    ["invalid group-fund override", (formData: FormData) => formData.set("isGroupFund", "sometimes")],
    ["unknown field", (formData: FormData) => formData.set("orgId", randomUUID())],
  ])("rejects malformed %s values and does not create an account", async (_case, mutate) => {
    const formData = validFormData();
    mutate(formData);

    await expectRedirect(() => saveAccountAction(formData), "/cuentas?error=invalid-form");

    const rows = await withTenantTransaction(ORG_ID, (tx) =>
      tx.select().from(account).where(eq(account.orgId, ORG_ID)));
    expect(rows).toEqual([]);
  });

  it("checks authorization before parsing form data", async () => {
    process.env.E2E_AUTH_BYPASS = "0";

    await expectRedirect(() => saveAccountAction(new FormData()), "/auth/login");
  });
});
