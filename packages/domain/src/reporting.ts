import { createHash } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  account,
  contribution,
  contributionCycle,
  member,
  organization,
  paymentAllocation,
  paymentReceipt,
  periodClose,
  repayment,
  statementArchive,
  statementArtifactEvent,
  transfer,
  withdrawal,
} from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export type VerifyResult =
  | { matched: true; groupName: string; generatedAt: string; movements: PublicStatementMovement[]; legacy?: true; periodLabel?: string }
  | { matched: false };

export type PublicStatementMovement = StatementReconciliationMovement & { label: string };
export type StatementArchiveView = typeof statementArchive.$inferSelect & {
  artifactStatus: "pending" | "failed" | "ready";
};

export interface ReportingService {
  readonly context: "reporting";
  listStatementArchive(orgId: string): Promise<StatementArchiveView[]>;
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

function moneyUnits4(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new Error("amount_must_be_numeric");
  const units = BigInt(match[2] ?? "0") * BigInt(10_000) + BigInt((match[3] ?? "").padEnd(4, "0") || "0");
  return match[1] === "-" ? -units : units;
}

function money4FromUnits(units: bigint): string {
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / BigInt(10_000)}.${String(absolute % BigInt(10_000)).padStart(4, "0")}`;
}

export function money(value: string | number): string {
  const units = moneyUnits4(value);
  const negative = units < BigInt(0);
  const roundedCents = ((negative ? -units : units) + BigInt(50)) / BigInt(100);
  const whole = (roundedCents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `USD ${negative ? "-" : ""}${whole}.${String(roundedCents % BigInt(100)).padStart(2, "0")}`;
}

export type MonthlyMemberStatementCopy = {
  monthlySectionTitle: string;
  openingBalance: string;
  contribution: string;
  withdrawal: string;
  closingBalance: string;
  treasurer: string;
  groupAccount: string;
  noGroupAccount: string;
  receivedPaymentsTitle: string;
  receivedPayment: string;
  loanFee: string;
  loanInterest: string;
  loanPrincipal: string;
  contributionAllocation: string;
  fallbackAllocation: string;
  unknownCycle: string;
  unknownMember: string;
  reconciliationTitle: string;
  pendingContribution: string;
  pendingRepayment: string;
  regularizedContribution: string;
  regularizedRepayment: string;
  regularizationTransfer: string;
  legacyAccount: string;
};

export type StatementReconciliationMovement = {
  id: string;
  kind: "contribution" | "repayment" | "regularization_transfer";
  status: "pending" | "regularized";
  amount: string;
  datedOn: string;
  accountName: string | null;
};

function publicMovements(
  rows: StatementReconciliationMovement[],
  copy: MonthlyMemberStatementCopy,
): PublicStatementMovement[] {
  return rows.map((movement) => {
    const kind = movement.kind === "regularization_transfer"
      ? copy.regularizationTransfer
      : movement.kind === "contribution"
        ? movement.status === "pending" ? copy.pendingContribution : copy.regularizedContribution
        : movement.status === "pending" ? copy.pendingRepayment : copy.regularizedRepayment;
    return { ...movement, label: `${kind} · ${movement.accountName ?? copy.legacyAccount}` };
  });
}

export function monthlyMemberStatementPayload(input: {
  orgName: string;
  periodLabel: string;
  member: { id: string; displayName: string };
  openingBalance: string;
  closingBalance: string;
  contributions: Array<{ id: string; amount: string; datedOn: string; slipPhotoUri: string | null }>;
  receivedPayments?: Array<{ id: string; amount: string; datedOn: string; memberName: string; details: string[] }>;
  reconciliationMovements?: StatementReconciliationMovement[];
  withdrawals: Array<{ id: string; amount: string; datedOn: string }>;
  treasurerName: string;
  bankLast4: string | null;
  copy: MonthlyMemberStatementCopy;
}) {
  const copy = input.copy;
  const verificationMovements = publicMovements(input.reconciliationMovements ?? [], copy);
  return {
    kind: "monthly_member",
    orgName: input.orgName,
    periodLabel: input.periodLabel,
    member: input.member,
    verificationMovements,
    sections: [
      {
        id: "member-monthly",
        title: copy.monthlySectionTitle,
        rows: [
          { label: copy.openingBalance, value: money(input.openingBalance) },
          ...input.contributions.map((row) => ({
            label: copy.contribution.replace("{{date}}", row.datedOn),
            value: money(row.amount),
            href: row.slipPhotoUri,
          })),
          ...input.withdrawals.map((row) => ({
            label: copy.withdrawal.replace("{{date}}", row.datedOn),
            value: money(row.amount),
          })),
          { label: copy.closingBalance, value: money(input.closingBalance) },
          { label: copy.treasurer, value: input.treasurerName },
          { label: copy.groupAccount, value: input.bankLast4 ? `****${input.bankLast4}` : copy.noGroupAccount },
        ],
      },
      ...(input.receivedPayments && input.receivedPayments.length > 0
        ? [{
            id: "member-received-payments",
            title: copy.receivedPaymentsTitle,
            rows: input.receivedPayments.map((row) => ({
              label: copy.receivedPayment.replace("{{member}}", row.memberName),
              amount: row.amount,
              datedOn: row.datedOn,
              details: row.details,
            })),
          }]
        : []),
      ...(input.reconciliationMovements && input.reconciliationMovements.length > 0
        ? [{
            id: "member-reconciliation",
            title: copy.reconciliationTitle,
            rows: verificationMovements.map((row) => {
              return {
                label: row.label,
                value: money(row.amount),
                datedOn: row.datedOn,
                status: row.status,
              };
            }),
          }]
        : []),
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

export type MemberStatementReceiptAllocationSource = {
  receiptId: string;
  receiptAmount: string;
  receiptDatedOn: string;
  memberName: string;
  allocationKind: string;
  allocationAmount: string;
  cycleLabel: string | null;
  sortOrder: number;
};

function allocationStatementLabel(
  row: Pick<MemberStatementReceiptAllocationSource, "allocationKind" | "cycleLabel">,
  copy: MonthlyMemberStatementCopy,
): string {
  switch (row.allocationKind) {
    case "loan_fee":
      return copy.loanFee;
    case "loan_interest":
      return copy.loanInterest;
    case "loan_principal":
      return copy.loanPrincipal;
    case "contribution_overdue":
    case "contribution_current":
    case "contribution_future":
    case "extra_savings":
      return copy.contributionAllocation.replace("{{cycle}}", row.cycleLabel ?? copy.unknownCycle);
    default:
      return copy.fallbackAllocation;
  }
}

export function monthlyMemberStatementReceivedPayments(
  rows: MemberStatementReceiptAllocationSource[],
  copy: MonthlyMemberStatementCopy,
): Array<{ id: string; amount: string; datedOn: string; memberName: string; details: string[] }> {
  const grouped = new Map<string, MemberStatementReceiptAllocationSource[]>();
  for (const row of [...rows].sort((left, right) =>
    left.receiptDatedOn.localeCompare(right.receiptDatedOn)
      || left.receiptId.localeCompare(right.receiptId)
      || left.sortOrder - right.sortOrder
  )) {
    grouped.set(row.receiptId, [...(grouped.get(row.receiptId) ?? []), row]);
  }

  return [...grouped.entries()].map(([receiptId, allocations]) => {
    const first = allocations[0];
    return {
      id: receiptId,
      amount: first?.receiptAmount ?? "0.0000",
      datedOn: dateOnly(first?.receiptDatedOn ?? ""),
      memberName: first?.memberName ?? copy.unknownMember,
      details: allocations.map((row) => `${allocationStatementLabel(row, copy)}: ${row.allocationAmount}`),
    };
  });
}

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

function money4Sum(values: Array<string | number>): string {
  return money4FromUnits(values.reduce((sum, value) => sum + moneyUnits4(value), BigInt(0)));
}

export function verifyResultFromArchivedPayload(input: {
  canonicalPayloadHash: string;
  canonicalPayload: unknown;
  generatedAt: Date | string;
  orgId?: string;
  periodLabel?: string;
  kind?: string;
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
    async verifyStatementHash(hash) {
      const [row] = await db.select({
        orgId: statementArchive.orgId,
        kind: statementArchive.kind,
        periodLabel: statementArchive.periodLabel,
        generatedAt: statementArchive.generatedAt,
        canonicalPayloadHash: statementArchive.canonicalPayloadHash,
        canonicalPayload: statementArchive.canonicalPayload,
      })
        .from(statementArchive)
        .where(eq(statementArchive.canonicalPayloadHash, hash.toLowerCase()));

      if (!row) {
        return { matched: false };
      }

      return verifyResultFromArchivedPayload(row);
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
            paymentReceiptId: contribution.paymentReceiptId,
          }).from(contribution)
            .where(and(
              eq(contribution.orgId, input.orgId),
              eq(contribution.memberId, row.id),
              sql`${contribution.datedOn} >= ${periodStart}`,
              sql`${contribution.datedOn} <= ${periodEnd}`,
            ))
            .orderBy(contribution.datedOn, contribution.id);
          const receiptAllocations = await tx.select({
            receiptId: paymentReceipt.id,
            receiptAmount: paymentReceipt.amount,
            receiptDatedOn: paymentReceipt.datedOn,
            memberName: member.displayName,
            allocationKind: paymentAllocation.allocationKind,
            allocationAmount: paymentAllocation.amount,
            cycleLabel: contributionCycle.cycleLabel,
            sortOrder: paymentAllocation.sortOrder,
          })
            .from(paymentReceipt)
            .innerJoin(paymentAllocation, and(
              eq(paymentAllocation.orgId, paymentReceipt.orgId),
              eq(paymentAllocation.receiptId, paymentReceipt.id),
            ))
            .leftJoin(contributionCycle, and(
              eq(contributionCycle.orgId, paymentAllocation.orgId),
              eq(contributionCycle.id, paymentAllocation.cycleId),
            ))
            .innerJoin(member, and(eq(member.orgId, paymentReceipt.orgId), eq(member.id, paymentReceipt.memberId)))
            .where(and(
              eq(paymentReceipt.orgId, input.orgId),
              eq(paymentReceipt.memberId, row.id),
              sql`${paymentReceipt.datedOn} >= ${periodStart}`,
              sql`${paymentReceipt.datedOn} <= ${periodEnd}`,
            ))
            .orderBy(paymentReceipt.datedOn, paymentReceipt.id, paymentAllocation.sortOrder);
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
          const movementResult = await tx.execute(sql`
            SELECT source.id,
                   source.kind,
                   source.reconciliation_status AS status,
                   source.amount::numeric(18, 4)::text AS amount,
                   source.dated_on::text AS "datedOn",
                   a.name AS "accountName"
            FROM (
              SELECT id, 'contribution'::text AS kind, reconciliation_status, amount, dated_on, account_id, reverses_id
              FROM contribution
              WHERE org_id = ${input.orgId} AND member_id = ${row.id}
              UNION ALL
              SELECT id, 'repayment'::text AS kind, reconciliation_status, amount, dated_on, account_id, reverses_id
              FROM repayment
              WHERE org_id = ${input.orgId} AND member_id = ${row.id}
            ) source
            LEFT JOIN account a ON a.id = source.account_id AND a.org_id = ${input.orgId}
            WHERE source.reverses_id IS NULL
              AND source.dated_on >= ${periodStart}
              AND source.dated_on <= ${periodEnd}
            UNION ALL
            SELECT t.id,
                   'regularization_transfer'::text AS kind,
                   'regularized'::text AS status,
                   t.amount::numeric(18, 4)::text AS amount,
                   t.dated_on::text AS "datedOn",
                   target.name AS "accountName"
            FROM transfer t
            JOIN account target ON target.id = t.to_account_id AND target.org_id = t.org_id
            WHERE t.org_id = ${input.orgId}
              AND t.purpose = 'regularization'
              AND t.reverses_id IS NULL
              AND t.dated_on >= ${periodStart}
              AND t.dated_on <= ${periodEnd}
              AND (
                (t.regularizes_kind = 'contribution' AND EXISTS (
                  SELECT 1 FROM contribution c WHERE c.id = t.regularizes_id AND c.org_id = t.org_id AND c.member_id = ${row.id}
                ))
                OR
                (t.regularizes_kind = 'repayment' AND EXISTS (
                  SELECT 1 FROM repayment r WHERE r.id = t.regularizes_id AND r.org_id = t.org_id AND r.member_id = ${row.id}
                ))
              )
            ORDER BY "datedOn", id
          `);
          const reconciliationMovements = (Array.isArray(movementResult) ? movementResult : movementResult.rows ?? []) as StatementReconciliationMovement[];

          const openingBalance = money4Sum([
            row.initialSavingsBalance,
            priorContributionTotal?.total ?? "0.0000",
            money4FromUnits(-moneyUnits4(priorWithdrawalTotal?.total ?? "0.0000")),
          ]);
          const closingBalance = money4Sum([
            openingBalance,
            ...contributions.map((item) => item.amount),
            ...withdrawals.map((item) => money4FromUnits(-moneyUnits4(item.amount))),
          ]);
          const payload = monthlyMemberStatementPayload({
            orgName: org?.displayName ?? "Mi Banquito",
            periodLabel: closeRow.periodLabel,
            member: { id: row.id, displayName: row.displayName },
            openingBalance,
            closingBalance,
            contributions: monthlyMemberStatementContributions(contributions.map((item) => ({
              id: item.id,
              amount: item.amount,
              datedOn: dateOnly(item.datedOn),
              slipPhotoUri: null,
              sourceKind: item.paymentReceiptId ? "payment_receipt" : "contribution",
            }))),
            receivedPayments: monthlyMemberStatementReceivedPayments(receiptAllocations, input.statementCopy),
            reconciliationMovements,
            withdrawals: withdrawals.map((item) => ({
              id: item.id,
              amount: item.amount,
              datedOn: dateOnly(item.datedOn),
            })),
            treasurerName: "member",
            bankLast4: null,
            copy: input.statementCopy,
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
            canonicalPayload: payload,
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
