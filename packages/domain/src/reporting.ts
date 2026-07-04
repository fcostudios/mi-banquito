import { eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { organization, statementArchive } from "@mi-banquito/db/schema";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string }
  | { matched: false };

export interface ReportingService {
  readonly context: "reporting";
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

export function createReportingService(): ReportingService {
  return {
    context: "reporting",
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
