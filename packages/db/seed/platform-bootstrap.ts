import { config } from "dotenv";
import { db } from "../src/index";
import { auditLogEntry, organization, platformOperator } from "../src/schema";
import { and, eq } from "drizzle-orm";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000000";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  if (process.env.CONFIRM_PLATFORM_BOOTSTRAP !== "YES") {
    throw new Error("Set CONFIRM_PLATFORM_BOOTSTRAP=YES to run the platform bootstrap seed.");
  }

  const now = new Date();
  const displayName = process.env.PLATFORM_ORG_DISPLAY_NAME?.trim() || "FcoStudios";
  const email = process.env.PLATFORM_OPERATOR_EMAIL?.trim().toLowerCase() || "pancho@fcostudios.io";
  const authSubject = requireEnv("PLATFORM_OPERATOR_AUTH_SUBJECT");
  const auth0OrgId = process.env.AUTH0_ORGANIZATION?.trim() || null;

  await db.transaction(async (tx) => {
    const [existingOperator] = await tx.select().from(platformOperator)
      .where(eq(platformOperator.authSubject, authSubject));
    const [operator] = existingOperator
      ? [existingOperator]
      : await tx.insert(platformOperator).values({
        displayName: process.env.PLATFORM_OPERATOR_NAME?.trim() || "Francisco Lomas",
        email,
        authSubject,
        status: "active",
        createdAt: now,
        updatedAt: null,
      }).returning();

    const [existingOrg] = await tx.select().from(organization)
      .where(and(
        eq(organization.displayName, displayName),
        eq(organization.platformOperatorId, operator.id),
      ));
    const [org] = existingOrg
      ? [existingOrg]
      : await tx.insert(organization).values({
        displayName,
        auth0OrgId,
        countryCode: process.env.PLATFORM_ORG_COUNTRY_CODE?.trim() || "EC",
        currencyCode: process.env.PLATFORM_ORG_CURRENCY_CODE?.trim() || "USD",
        timezone: process.env.PLATFORM_ORG_TIMEZONE?.trim() || "America/Guayaquil",
        defaultLanguage: process.env.PLATFORM_ORG_LANGUAGE?.trim() || "es-EC",
        status: "active",
        brandingLogoUri: null,
        createdAt: now,
        createdBy: operator.id,
        createdByKind: "platform_operator",
        updatedAt: null,
        updatedBy: null,
        platformOperatorId: operator.id,
      }).returning();

    await tx.insert(auditLogEntry).values({
      orgId: org.id,
      actorKind: existingOperator && existingOrg ? "system" : "platform_operator",
      actorId: existingOperator && existingOrg ? SYSTEM_ACTOR_ID : operator.id,
      actionKind: "platform.bootstrap",
      subjectKind: "organization",
      subjectId: org.id,
      payloadSnapshot: {
        orgId: org.id,
        orgDisplayName: org.displayName,
        auth0OrgId,
        platformOperatorId: operator.id,
        authSubject,
        idempotentReplay: Boolean(existingOperator && existingOrg),
      },
      reason: "Confirmed platform bootstrap seed",
      at: now,
      createdAt: now,
    });

    if (existingOrg && auth0OrgId && existingOrg.auth0OrgId !== auth0OrgId) {
      await tx.update(organization)
        .set({ auth0OrgId, updatedAt: now, updatedBy: operator.id })
        .where(eq(organization.id, existingOrg.id));
    }

    console.log(JSON.stringify({
      orgId: org.id,
      auth0OrgId,
      platformOperatorId: operator.id,
      idempotentReplay: Boolean(existingOperator && existingOrg),
    }));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
