import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { organization, statementArchive } from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string }
  | { matched: false };

export interface ReportingService {
  readonly context: "reporting";
  listStatementArchive(orgId: string): Promise<Array<typeof statementArchive.$inferSelect>>;
  verifyStatementHash(hash: string): Promise<VerifyResult>;
}

export function publicVerifyUrl(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify/${hash.toLowerCase()}`;
}

export function verifierResultText(result: VerifyResult): string {
  if (!result.matched) {
    return "No se encontró un documento con este código.";
  }
  return `Este documento coincide con el registro del grupo ${result.groupName} al ${result.generatedAt.slice(0, 10)}.`;
}

type JsonValue = undefined | null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createReportingService(): ReportingService {
  return {
    context: "reporting",
    async listStatementArchive(orgId) {
      return withTenantTransaction(orgId, async (tx) => tx.select().from(statementArchive)
        .where(eq(statementArchive.orgId, orgId))
        .orderBy(desc(statementArchive.generatedAt)));
    },
    async verifyStatementHash(hash) {
      const [row] = await db.select({
        generatedAt: statementArchive.generatedAt,
        groupName: organization.displayName,
      })
        .from(statementArchive)
        .innerJoin(organization, eq(organization.id, statementArchive.orgId))
        .where(eq(statementArchive.canonicalPayloadHash, hash.toLowerCase()));

      if (!row) {
        return { matched: false };
      }

      return {
        matched: true,
        groupName: row.groupName,
        generatedAt: row.generatedAt instanceof Date ? row.generatedAt.toISOString() : String(row.generatedAt),
      };
    },
  };
}
