import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  contributionCycle,
  member,
  periodClose,
  statementArchive,
  statementArtifactEvent,
} from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

import { canonicalJson, createMemberStatementService, sha256Hex } from "./member-statements";
import { formatMoney4Units, parseMoney4Units } from "./money4";
import { createTransparencyService } from "./transparency";
import type { PeriodTransparency } from "./transparency";
import type {
  JsonValue,
  MonthlyMemberStatementArtifactInput,
  MonthlyMemberStatementArtifactResult,
  MonthlyMemberStatementCopy,
  PublicStatementMovement,
} from "./member-statements";

export {
  canonicalJson,
  money,
  monthlyMemberStatementContributions,
  monthlyMemberStatementPayload,
  monthlyMemberStatementReceivedPayments,
  sha256Hex,
} from "./member-statements";
export type {
  LegacyPublicStatementMovement,
  MemberStatementContributionSource,
  MemberStatementReceiptAllocationSource,
  MonthlyMemberStatementArtifactInput,
  MonthlyMemberStatementArtifactResult,
  MonthlyMemberStatementContribution,
  MonthlyMemberStatementCopy,
  MonthlyMemberStatementPayload,
  PublicStatementMovement,
} from "./member-statements";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string; movements: PublicStatementMovement[]; legacy?: true; periodLabel?: string; pdfUri?: string }
  | { matched: false };

export type StatementArchiveView = typeof statementArchive.$inferSelect & {
  artifactStatus: "pending" | "failed" | "ready";
};

export type StatementArchiveSummary = {
  periodLabel: string;
  members: number;
  in: string;
  out: string;
  movements: string;
  saldo: string;
};

function sumSigned(rows: PeriodTransparency["rows"]): string {
  return formatMoney4Units(rows.reduce(
    (total, row) => total + parseMoney4Units(row.signedAmount),
    BigInt(0),
  ));
}

export function statementArchiveSummaryFromTransparency(
  periodLabel: string,
  projection: PeriodTransparency,
): StatementArchiveSummary {
  const memberIds = new Set(projection.rows.flatMap((row) => row.memberId ? [row.memberId] : []));
  const incoming = projection.rows.filter((row) => row.sourceKind === "contribution");
  const outgoing = projection.rows.filter((row) => row.sourceKind === "loan_disbursement");
  const otherMovements = projection.rows.filter((row) =>
    row.sourceKind !== "contribution" && row.sourceKind !== "loan_disbursement");
  return {
    periodLabel,
    members: memberIds.size,
    in: sumSigned(incoming),
    out: formatMoney4Units(-parseMoney4Units(sumSigned(outgoing))),
    movements: sumSigned(otherMovements),
    saldo: projection.netFundBalance,
  };
}

export interface ReportingService {
  readonly context: "reporting";
  listStatementArchive(orgId: string): Promise<StatementArchiveView[]>;
  getLatestStatementSummary(orgId: string): Promise<StatementArchiveSummary | null>;
  verifyStatementHash(hash: string): Promise<VerifyResult>;
  generateMonthlyMemberStatements(input: {
    orgId: string;
    actorId: string;
    periodCloseId: string;
    memberId?: string;
    statementCopy: MonthlyMemberStatementCopy;
    createArtifact: (input: MonthlyMemberStatementArtifactInput) => Promise<MonthlyMemberStatementArtifactResult>;
  }): Promise<{ generated: number; reused: number }>;
  recordStatementShare(input: { orgId: string; actorId: string; statementArchiveId: string }): Promise<{ whatsappUrl: string | null }>;
}

export function publicVerifyUrl(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/verify/${hash.toLowerCase()}`;
}

export function publicStatementPdfUrl(baseUrl: string, hash: string): string {
  return `${baseUrl.replace(/\/$/, "")}/statement-archive/public/${hash.toLowerCase()}.pdf`;
}

function absolutePublicStatementPdfUrl(pdfUri: string): string {
  if (/^https?:\/\//i.test(pdfUri)) {
    return pdfUri;
  }
  const baseUrl = process.env.APP_BASE_URL ?? "https://mi-banquito.vercel.app";
  const path = pdfUri.startsWith("/") ? pdfUri : `/${pdfUri}`;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function verifierResultText(result: VerifyResult): string {
  if (!result.matched) {
    return "No se encontró un documento con este código.";
  }
  return `Este documento coincide con el registro del grupo ${result.groupName} al ${result.generatedAt.slice(0, 10)}.`;
}
export function buildStatementShareUrl(input: { whatsappNumber: string | null; pdfUri: string; memberName: string }) {
  const digits = input.whatsappNumber?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const message = `Hola ${input.memberName}, te comparto tu estado de cuenta de Mi Banquito: ${input.pdfUri}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function verifyResultFromArchivedPayload(input: {
  canonicalPayloadHash: string;
  canonicalPayload: unknown;
  generatedAt: Date | string;
  orgId?: string;
  periodLabel?: string;
  kind?: string;
  pdfUri?: string;
}): VerifyResult {
  if (!input.canonicalPayload || typeof input.canonicalPayload !== "object") {
    if (!input.orgId || !input.periodLabel || !input.kind || !/^[a-f0-9]{64}$/.test(input.canonicalPayloadHash)) {
      return { matched: false };
    }
    return {
      matched: true,
      groupName: "Archivo historico",
      generatedAt: input.generatedAt instanceof Date ? input.generatedAt.toISOString() : String(input.generatedAt),
      movements: [],
      legacy: true,
      periodLabel: input.periodLabel,
      ...(input.pdfUri ? { pdfUri: input.pdfUri } : {}),
    };
  }
  const payload = input.canonicalPayload as {
    orgName?: unknown;
    branding?: { orgName?: unknown };
    verificationMovements?: unknown;
  };
  const groupName = typeof payload.orgName === "string" ? payload.orgName : payload.branding?.orgName;
  if (
    typeof groupName !== "string"
    || (payload.verificationMovements !== undefined && !Array.isArray(payload.verificationMovements))
    || sha256Hex(canonicalJson(input.canonicalPayload as JsonValue)) !== input.canonicalPayloadHash
  ) return { matched: false };
  return {
    matched: true,
    groupName,
    generatedAt: input.generatedAt instanceof Date ? input.generatedAt.toISOString() : String(input.generatedAt),
    movements: (payload.verificationMovements ?? []) as PublicStatementMovement[],
    ...(input.periodLabel ? { periodLabel: input.periodLabel } : {}),
    ...(input.pdfUri ? { pdfUri: input.pdfUri } : {}),
  };
}

export function createReportingService(): ReportingService {
  return {
    context: "reporting",
    async listStatementArchive(orgId) {
      return withTenantTransaction(orgId, async (tx) => {
        const rows = await tx.select().from(statementArchive)
          .where(eq(statementArchive.orgId, orgId))
          .orderBy(desc(statementArchive.generatedAt));
        return Promise.all(rows.map(async (row) => {
          if (row.kind !== "monthly_close") return { ...row, artifactStatus: "ready" as const };
          const [event] = await tx.select({ status: statementArtifactEvent.status }).from(statementArtifactEvent)
            .where(and(
              eq(statementArtifactEvent.orgId, orgId),
              eq(statementArtifactEvent.statementArchiveId, row.id),
            ))
            .orderBy(
              desc(statementArtifactEvent.createdAt),
              desc(statementArtifactEvent.attemptNumber),
              sql`CASE ${statementArtifactEvent.status} WHEN 'ready' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC`,
            )
            .limit(1);
          return {
            ...row,
            artifactStatus: event?.status ?? (row.byteSize === 0 ? "pending" as const : "ready" as const),
          };
        }));
      });
    },
    async getLatestStatementSummary(orgId) {
      const latest = await withTenantTransaction(orgId, async (tx) => {
        const [row] = await tx.select({
          periodLabel: contributionCycle.cycleLabel,
          cycleKind: contributionCycle.kind,
          opensOn: contributionCycle.opensOn,
          closesOn: contributionCycle.closesOn,
        })
          .from(periodClose)
          .innerJoin(contributionCycle, and(
            eq(contributionCycle.orgId, periodClose.orgId),
            eq(contributionCycle.id, periodClose.cycleId),
          ))
          .where(eq(periodClose.orgId, orgId))
          .orderBy(desc(periodClose.closedAt), desc(periodClose.id))
          .limit(1);
        return row ?? null;
      });
      if (!latest) return null;
      if (latest.cycleKind !== "monthly" && latest.cycleKind !== "weekly") {
        throw new Error("statement_summary_cycle_kind_unsupported");
      }
      const projection = await createTransparencyService().getPeriod({
        orgId,
        fromDate: String(latest.opensOn),
        throughDate: String(latest.closesOn),
      });
      return statementArchiveSummaryFromTransparency(latest.periodLabel, projection);
    },
    async verifyStatementHash(hash) {
      const [row] = await db.select({
        orgId: statementArchive.orgId,
        kind: statementArchive.kind,
        periodLabel: statementArchive.periodLabel,
        generatedAt: statementArchive.generatedAt,
        canonicalPayloadHash: statementArchive.canonicalPayloadHash,
        canonicalPayload: statementArchive.canonicalPayload,
        pdfUri: statementArchive.pdfUri,
      })
        .from(statementArchive)
        .where(eq(statementArchive.canonicalPayloadHash, hash.toLowerCase()));

      if (!row) {
        return { matched: false };
      }

      return verifyResultFromArchivedPayload(row);
    },
    generateMonthlyMemberStatements(input) {
      return createMemberStatementService().generate(input);
    },
    async recordStatementShare(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [row] = await tx.select({
          id: statementArchive.id,
          pdfUri: statementArchive.pdfUri,
          memberId: statementArchive.memberId,
          periodLabel: statementArchive.periodLabel,
          memberName: member.displayName,
          whatsappNumber: member.whatsappNumber,
        })
          .from(statementArchive)
          .leftJoin(member, and(eq(member.id, statementArchive.memberId), eq(member.orgId, statementArchive.orgId)))
          .where(and(eq(statementArchive.orgId, input.orgId), eq(statementArchive.id, input.statementArchiveId)))
          .limit(1);
        if (!row) throw new Error("statement_archive_not_found");
        const whatsappUrl = buildStatementShareUrl({
          whatsappNumber: row.whatsappNumber ?? null,
          memberName: row.memberName ?? "socia",
          pdfUri: absolutePublicStatementPdfUrl(row.pdfUri),
        });
        const now = new Date();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "statement.shared",
          subjectKind: "statement_archive",
          subjectId: row.id,
          payloadSnapshot: { statementArchiveId: row.id, periodLabel: row.periodLabel, whatsapp: Boolean(whatsappUrl) },
          reason: null,
          at: now,
          createdAt: now,
        });
        return { whatsappUrl };
      });
    },
  };
}
