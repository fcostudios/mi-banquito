import { createHash } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  contribution,
  contributionCycle,
  member,
  organization,
  periodClose,
  statementArchive,
  withdrawal,
} from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string }
  | { matched: false };

export interface ReportingService {
  readonly context: "reporting";
  listStatementArchive(orgId: string): Promise<Array<typeof statementArchive.$inferSelect>>;
  verifyStatementHash(hash: string): Promise<VerifyResult>;
  generateMonthlyMemberStatements(input: {
    orgId: string;
    actorId: string;
    periodCloseId: string;
    memberId?: string;
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

export function money(value: string | number): string {
  return `USD ${Number(value).toFixed(2)}`;
}

export function monthlyMemberStatementPayload(input: {
  orgName: string;
  periodLabel: string;
  member: { id: string; displayName: string };
  openingBalance: string;
  closingBalance: string;
  contributions: Array<{ id: string; amount: string; datedOn: string; slipPhotoUri: string | null }>;
  withdrawals: Array<{ id: string; amount: string; datedOn: string }>;
  treasurerName: string;
  bankLast4: string | null;
}) {
  return {
    kind: "monthly_member",
    orgName: input.orgName,
    periodLabel: input.periodLabel,
    member: input.member,
    sections: [
      {
        id: "member-monthly",
        title: "Estado mensual",
        rows: [
          { label: "Saldo inicial", value: money(input.openingBalance) },
          ...input.contributions.map((row) => ({
            label: `Aporte ${row.datedOn}`,
            value: money(row.amount),
            href: row.slipPhotoUri,
          })),
          ...input.withdrawals.map((row) => ({
            label: `Retiro ${row.datedOn}`,
            value: money(row.amount),
          })),
          { label: "Saldo final", value: money(input.closingBalance) },
          { label: "Tesorera", value: input.treasurerName },
          { label: "Cuenta del grupo", value: input.bankLast4 ? `****${input.bankLast4}` : "Sin cuenta registrada" },
        ],
      },
    ],
  };
}

export type MonthlyMemberStatementPayload = ReturnType<typeof monthlyMemberStatementPayload>;

export type MemberStatementContributionSource = {
  id: string;
  amount: string;
  datedOn: string;
  slipPhotoUri: string | null;
  sourceKind?: "contribution" | "payment_receipt";
};

export function monthlyMemberStatementContributions(
  rows: MemberStatementContributionSource[],
): Array<{ id: string; amount: string; datedOn: string; slipPhotoUri: string | null }> {
  return rows
    .filter((row) => row.sourceKind !== "payment_receipt")
    .sort((left, right) => left.datedOn.localeCompare(right.datedOn) || left.id.localeCompare(right.id))
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      datedOn: row.datedOn,
      slipPhotoUri: row.slipPhotoUri,
    }));
}

export type MonthlyMemberStatementContribution = ReturnType<typeof monthlyMemberStatementContributions>[number];

export type MonthlyMemberStatementArtifactInput = {
  orgId: string;
  canonicalPayloadHash: string;
  periodLabel: string;
  memberName: string;
  payload: MonthlyMemberStatementPayload;
};

export type MonthlyMemberStatementArtifactResult = {
  pdfUri: string;
  byteSize: number;
};

export function buildStatementShareUrl(input: { whatsappNumber: string | null; pdfUri: string; memberName: string }) {
  const digits = input.whatsappNumber?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const message = `Hola ${input.memberName}, te comparto tu estado de cuenta de Mi Banquito: ${input.pdfUri}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function monthStart(periodLabel: string): string {
  return `${periodLabel}-01`;
}

function monthEnd(periodLabel: string): string {
  const [year, month] = periodLabel.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function money4(value: number): string {
  return value.toFixed(4);
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
    async generateMonthlyMemberStatements(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [closeRow] = await tx.select({
          id: periodClose.id,
          cycleId: periodClose.cycleId,
          periodLabel: contributionCycle.cycleLabel,
        })
          .from(periodClose)
          .innerJoin(contributionCycle, and(eq(contributionCycle.id, periodClose.cycleId), eq(contributionCycle.orgId, periodClose.orgId)))
          .where(and(eq(periodClose.orgId, input.orgId), eq(periodClose.id, input.periodCloseId)))
          .limit(1);
        if (!closeRow) {
          throw new Error("period_close_not_found");
        }

        const [org] = await tx.select().from(organization).where(eq(organization.id, input.orgId)).limit(1);
        const members = await tx.select().from(member)
          .where(and(
            eq(member.orgId, input.orgId),
            eq(member.status, "activo"),
            ...(input.memberId ? [eq(member.id, input.memberId)] : []),
          ))
          .orderBy(member.displayName);
        const generatedAt = new Date();
        const periodStart = monthStart(closeRow.periodLabel);
        const periodEnd = monthEnd(closeRow.periodLabel);
        let generated = 0;
        let reused = 0;

        for (const row of members) {
          const [priorContributionTotal] = await tx.select({ total: sql<string>`COALESCE(SUM(${contribution.amount}), 0)::text` })
            .from(contribution)
            .where(and(eq(contribution.orgId, input.orgId), eq(contribution.memberId, row.id), lt(contribution.datedOn, periodStart)));
          const [priorWithdrawalTotal] = await tx.select({ total: sql<string>`COALESCE(SUM(${withdrawal.amount}), 0)::text` })
            .from(withdrawal)
            .where(and(eq(withdrawal.orgId, input.orgId), eq(withdrawal.memberId, row.id), lt(withdrawal.datedOn, periodStart)));
          const contributions = await tx.select({
            id: contribution.id,
            amount: contribution.amount,
            datedOn: contribution.datedOn,
          }).from(contribution)
            .where(and(
              eq(contribution.orgId, input.orgId),
              eq(contribution.memberId, row.id),
              sql`${contribution.datedOn} >= ${periodStart}`,
              sql`${contribution.datedOn} <= ${periodEnd}`,
            ))
            .orderBy(contribution.datedOn, contribution.id);
          const withdrawals = await tx.select({
            id: withdrawal.id,
            amount: withdrawal.amount,
            datedOn: withdrawal.datedOn,
          }).from(withdrawal)
            .where(and(
              eq(withdrawal.orgId, input.orgId),
              eq(withdrawal.memberId, row.id),
              sql`${withdrawal.datedOn} >= ${periodStart}`,
              sql`${withdrawal.datedOn} <= ${periodEnd}`,
            ))
            .orderBy(withdrawal.datedOn);

          const openingBalance = Number(row.initialSavingsBalance) + Number(priorContributionTotal?.total ?? 0) - Number(priorWithdrawalTotal?.total ?? 0);
          const closingBalance = openingBalance
            + contributions.reduce((sum, item) => sum + Number(item.amount), 0)
            - withdrawals.reduce((sum, item) => sum + Number(item.amount), 0);
          const payload = monthlyMemberStatementPayload({
            orgName: org?.displayName ?? "Mi Banquito",
            periodLabel: closeRow.periodLabel,
            member: { id: row.id, displayName: row.displayName },
            openingBalance: money4(openingBalance),
            closingBalance: money4(closingBalance),
            contributions: monthlyMemberStatementContributions(contributions.map((item) => ({
              id: item.id,
              amount: item.amount,
              datedOn: dateOnly(item.datedOn),
              slipPhotoUri: null,
              sourceKind: "contribution",
            }))),
            withdrawals: withdrawals.map((item) => ({
              id: item.id,
              amount: item.amount,
              datedOn: dateOnly(item.datedOn),
            })),
            treasurerName: "member",
            bankLast4: null,
          });
          const hash = sha256Hex(canonicalJson(payload));
          const existing = await tx.select({ id: statementArchive.id }).from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, input.orgId),
              eq(statementArchive.kind, "monthly_member"),
              eq(statementArchive.memberId, row.id),
              eq(statementArchive.periodLabel, closeRow.periodLabel),
            ))
            .limit(1);
          if (existing.length > 0) {
            reused += 1;
            continue;
          }
          const artifact = await input.createArtifact({
            orgId: input.orgId,
            canonicalPayloadHash: hash,
            periodLabel: closeRow.periodLabel,
            memberName: row.displayName,
            payload,
          });
          const [archiveRow] = await tx.insert(statementArchive).values({
            orgId: input.orgId,
            kind: "monthly_member",
            memberId: row.id,
            periodLabel: closeRow.periodLabel,
            pdfUri: artifact.pdfUri,
            canonicalPayloadHash: hash,
            generatedAt,
            periodCloseId: closeRow.id,
            yearEndShareOutId: null,
            byteSize: artifact.byteSize,
            createdAt: generatedAt,
            createdByKind: "system",
          }).returning();
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "statement.generated",
            subjectKind: "statement_archive",
            subjectId: archiveRow.id,
            payloadSnapshot: {
              kind: "monthly_member",
              memberId: row.id,
              periodLabel: closeRow.periodLabel,
              canonicalPayloadHash: hash,
            },
            reason: null,
            at: generatedAt,
            createdAt: generatedAt,
          });
          generated += 1;
        }

        return { generated, reused };
      });
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
