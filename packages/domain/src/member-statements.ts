import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import {
  auditLogEntry,
  contribution,
  contributionCycle,
  member,
  organization,
  paymentAllocation,
  paymentReceipt,
  periodClose,
  statementArchive,
  withdrawal,
} from "@mi-banquito/db/schema";
import { lockTenantMoneyWrites, withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

import { getPeriodTransparency } from "./transparency";
import type { TransparencyMovement } from "./transparency";

export type JsonValue = undefined | null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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
  fundMovementsTitle: string;
};

export type LegacyPublicStatementMovement = {
  id: string;
  kind: "contribution" | "repayment" | "regularization_transfer";
  status: "pending" | "regularized";
  amount: string;
  datedOn: string;
  accountName: string | null;
  label: string;
};

export type PublicStatementMovement = TransparencyMovement | LegacyPublicStatementMovement;

const transparencySourceKinds = new Set([
  "contribution", "repayment", "withdrawal", "loan_disbursement", "expense", "transfer", "collection_line",
]);

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function normalizeArchivedStatementMovement(value: unknown): TransparencyMovement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.sourceKind === "string" && transparencySourceKinds.has(row.sourceKind)
    && typeof row.sourceId === "string" && typeof row.datedOn === "string"
    && nullableString(row.memberId) && nullableString(row.collectionId)
    && typeof row.category === "string" && typeof row.label === "string"
    && typeof row.signedAmount === "string"
    && (row.reconciliationStatus === null || row.reconciliationStatus === "pending" || row.reconciliationStatus === "regularized")
    && nullableString(row.reversesId) && nullableString(row.accountName)
  ) return row as TransparencyMovement;

  if (
    typeof row.id === "string" && typeof row.kind === "string"
    && typeof row.datedOn === "string" && typeof row.amount === "string"
    && (row.status === "pending" || row.status === "regularized")
    && nullableString(row.accountName) && typeof row.label === "string"
  ) {
    const sourceKind = row.kind === "regularization_transfer" ? "transfer" : row.kind;
    if (!transparencySourceKinds.has(sourceKind)) return null;
    return {
      sourceKind: sourceKind as TransparencyMovement["sourceKind"],
      sourceId: row.id,
      datedOn: row.datedOn,
      memberId: null,
      collectionId: null,
      category: row.kind === "regularization_transfer" ? "regularization" : row.kind,
      label: row.label,
      signedAmount: row.amount,
      reconciliationStatus: row.status,
      reversesId: null,
      accountName: row.accountName,
    };
  }
  return null;
}

export function monthlyMemberStatementPayload(input: {
  orgName: string;
  periodLabel: string;
  member: { id: string; displayName: string };
  openingBalance: string;
  closingBalance: string;
  contributions: Array<{ id: string; amount: string; datedOn: string; slipPhotoUri: string | null }>;
  receivedPayments?: Array<{ id: string; amount: string; datedOn: string; memberName: string; details: string[] }>;
  verificationMovements?: TransparencyMovement[];
  withdrawals: Array<{ id: string; amount: string; datedOn: string }>;
  treasurerName: string;
  bankLast4: string | null;
  copy: MonthlyMemberStatementCopy;
}) {
  const copy = input.copy;
  const verificationMovements = input.verificationMovements ?? [];
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
      ...(verificationMovements.length > 0
        ? [{
            id: "fund-movements",
            title: copy.fundMovementsTitle,
            rows: verificationMovements.map((row) => {
              return {
                sourceId: row.sourceId,
                label: row.reversesId ? `Reverso · ${row.label}` : row.label,
                value: money(row.signedAmount),
                datedOn: row.datedOn,
                category: row.category,
                accountName: row.accountName,
                status: row.reconciliationStatus,
                reversesId: row.reversesId,
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
  storageUri?: string;
};

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export type MemberStatementPreview = {
  payload: MonthlyMemberStatementPayload;
  canonicalPayloadHash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArchivedStatementRow(value: unknown): boolean {
  if (!isRecord(value) || typeof value.label !== "string") return false;
  if (typeof value.value !== "string" && typeof value.amount !== "string") return false;
  return value.details === undefined
    || (Array.isArray(value.details) && value.details.every((detail) => typeof detail === "string"));
}

export function memberStatementPreviewFromArchivedPayload(input: {
  canonicalPayload: unknown;
  canonicalPayloadHash: string;
  expectedMemberId: string;
  expectedPeriodLabel: string;
}): MemberStatementPreview | null {
  if (!isRecord(input.canonicalPayload)) return null;
  const payload = input.canonicalPayload;
  if (sha256Hex(canonicalJson(payload as JsonValue)) !== input.canonicalPayloadHash) return null;
  const archivedMember = payload.member;
  const archivedMovements = Array.isArray(payload.verificationMovements)
    ? payload.verificationMovements.map(normalizeArchivedStatementMovement)
    : null;
  if (
    payload.kind !== "monthly_member"
    || typeof payload.orgName !== "string"
    || payload.periodLabel !== input.expectedPeriodLabel
    || !isRecord(archivedMember)
    || archivedMember.id !== input.expectedMemberId
    || typeof archivedMember.displayName !== "string"
    || !archivedMovements
    || archivedMovements.some((movement) => movement === null)
    || !Array.isArray(payload.sections)
    || !payload.sections.every((section) => isRecord(section)
      && typeof section.id === "string"
      && typeof section.title === "string"
      && Array.isArray(section.rows)
      && section.rows.every(isArchivedStatementRow))
  ) return null;
  return {
    payload: {
      ...payload,
      verificationMovements: archivedMovements.filter((movement) => movement !== null),
    } as MonthlyMemberStatementPayload,
    canonicalPayloadHash: input.canonicalPayloadHash,
  };
}

export interface MemberStatementService {
  preview(input: {
    orgId: string;
    periodCloseId: string;
    memberId: string;
    statementCopy: MonthlyMemberStatementCopy;
  }): Promise<MemberStatementPreview>;
  generate(input: {
    orgId: string;
    actorId: string;
    periodCloseId: string;
    memberId?: string;
    statementCopy: MonthlyMemberStatementCopy;
    createArtifact: (input: MonthlyMemberStatementArtifactInput) => Promise<MonthlyMemberStatementArtifactResult>;
    deleteArtifact?: (artifact: MonthlyMemberStatementArtifactResult) => Promise<void>;
  }): Promise<{ generated: number; reused: number }>;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type BuildPreviewInput = {
  orgId: string;
  periodCloseId: string;
  memberId: string;
  statementCopy: MonthlyMemberStatementCopy;
};

function money4Sum(values: Array<string | number>): string {
  return money4FromUnits(values.reduce((sum, value) => sum + moneyUnits4(value), BigInt(0)));
}

async function buildPreview(
  tx: Transaction,
  input: BuildPreviewInput,
  afterBaselineRead?: () => Promise<void>,
): Promise<MemberStatementPreview> {
  await lockTenantMoneyWrites(tx, input.orgId);
  const [closeRow] = await tx.select({
    id: periodClose.id,
    periodLabel: contributionCycle.cycleLabel,
    cycleKind: contributionCycle.kind,
    opensOn: contributionCycle.opensOn,
    closesOn: contributionCycle.closesOn,
  })
    .from(periodClose)
    .innerJoin(contributionCycle, and(
      eq(contributionCycle.id, periodClose.cycleId),
      eq(contributionCycle.orgId, periodClose.orgId),
    ))
    .where(and(eq(periodClose.orgId, input.orgId), eq(periodClose.id, input.periodCloseId)))
    .limit(1);
  if (!closeRow) throw new Error("period_close_not_found");
  if (closeRow.cycleKind !== "monthly" && closeRow.cycleKind !== "weekly") {
    throw new Error("member_statement_cycle_kind_unsupported");
  }

  const [org] = await tx.select({ displayName: organization.displayName })
    .from(organization)
    .where(eq(organization.id, input.orgId))
    .limit(1);
  const [memberRow] = await tx.select().from(member)
    .where(and(
      eq(member.orgId, input.orgId),
      eq(member.id, input.memberId),
      eq(member.status, "activo"),
    ))
    .limit(1);
  if (!memberRow) throw new Error("member_not_found");

  const periodStart = String(closeRow.opensOn);
  const periodEnd = String(closeRow.closesOn);
  const [priorContributionTotal] = await tx.select({ total: sql<string>`COALESCE(SUM(${contribution.amount}), 0)::text` })
    .from(contribution)
    .where(and(
      eq(contribution.orgId, input.orgId),
      eq(contribution.memberId, memberRow.id),
      lt(contribution.datedOn, periodStart),
    ));
  const [priorWithdrawalTotal] = await tx.select({ total: sql<string>`COALESCE(SUM(${withdrawal.amount}), 0)::text` })
    .from(withdrawal)
    .where(and(
      eq(withdrawal.orgId, input.orgId),
      eq(withdrawal.memberId, memberRow.id),
      lt(withdrawal.datedOn, periodStart),
    ));
  const contributions = await tx.select({
    id: contribution.id,
    amount: contribution.amount,
    datedOn: contribution.datedOn,
    paymentReceiptId: contribution.paymentReceiptId,
  }).from(contribution)
    .where(and(
      eq(contribution.orgId, input.orgId),
      eq(contribution.memberId, memberRow.id),
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
      eq(paymentReceipt.memberId, memberRow.id),
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
      eq(withdrawal.memberId, memberRow.id),
      sql`${withdrawal.datedOn} >= ${periodStart}`,
      sql`${withdrawal.datedOn} <= ${periodEnd}`,
    ))
    .orderBy(withdrawal.datedOn, withdrawal.id);
  await afterBaselineRead?.();
  const transparency = await getPeriodTransparency(tx, {
    orgId: input.orgId,
    fromDate: periodStart,
    throughDate: periodEnd,
    memberId: memberRow.id,
  });

  const openingBalance = money4Sum([
    memberRow.initialSavingsBalance,
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
    member: { id: memberRow.id, displayName: memberRow.displayName },
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
    verificationMovements: transparency.rows,
    withdrawals: withdrawals.map((item) => ({
      id: item.id,
      amount: item.amount,
      datedOn: dateOnly(item.datedOn),
    })),
    treasurerName: "member",
    bankLast4: null,
    copy: input.statementCopy,
  });
  return { payload, canonicalPayloadHash: sha256Hex(canonicalJson(payload)) };
}

export function createMemberStatementService(options: {
  now?: () => Date;
  afterBaselineRead?: () => Promise<void>;
} = {}): MemberStatementService {
  const now = options.now ?? (() => new Date());
  return {
    preview(input) {
      return withTenantTransaction(input.orgId, (tx) => buildPreview(tx, input, options.afterBaselineRead));
    },
    async generate(input) {
      const members = await withTenantTransaction(input.orgId, async (tx) => {
        const [close] = await tx.select({ id: periodClose.id }).from(periodClose)
          .where(and(eq(periodClose.orgId, input.orgId), eq(periodClose.id, input.periodCloseId)))
          .limit(1);
        if (!close) throw new Error("period_close_not_found");

        const rows = await tx.select({ id: member.id }).from(member)
          .where(and(
            eq(member.orgId, input.orgId),
            eq(member.status, "activo"),
            ...(input.memberId ? [eq(member.id, input.memberId)] : []),
          ))
          .orderBy(member.displayName, member.id);
        if (input.memberId && rows.length === 0) throw new Error("member_not_found");
        return rows;
      });

      let generated = 0;
      let reused = 0;
      const generatedAt = now();
      for (const row of members) {
        let artifactToCleanup: MonthlyMemberStatementArtifactResult | undefined;
        try {
          const result = await withWritableTenantTransaction(input.orgId, async (tx) => {
          const preview = await buildPreview(tx, { ...input, memberId: row.id }, options.afterBaselineRead);
          const lockKey = [
            "statement-generation",
            input.orgId,
            "monthly_member",
            row.id,
            preview.payload.periodLabel,
          ].join(":");
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
          const existing = await tx.select({ id: statementArchive.id }).from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, input.orgId),
              eq(statementArchive.kind, "monthly_member"),
              eq(statementArchive.memberId, row.id),
              eq(statementArchive.periodLabel, preview.payload.periodLabel),
            ))
            .limit(1);
          if (existing.length > 0) {
            return "reused" as const;
          }

          const artifact = await input.createArtifact({
            orgId: input.orgId,
            canonicalPayloadHash: preview.canonicalPayloadHash,
            periodLabel: preview.payload.periodLabel,
            memberName: preview.payload.member.displayName,
            payload: preview.payload,
          });
          artifactToCleanup = artifact;
          const [archiveRow] = await tx.insert(statementArchive).values({
            orgId: input.orgId,
            kind: "monthly_member",
            memberId: row.id,
            periodLabel: preview.payload.periodLabel,
            pdfUri: artifact.pdfUri,
            canonicalPayloadHash: preview.canonicalPayloadHash,
            canonicalPayload: preview.payload,
            generatedAt,
            periodCloseId: input.periodCloseId,
            yearEndShareOutId: null,
            byteSize: artifact.byteSize,
            createdAt: generatedAt,
            createdByKind: "system",
          }).returning();
          if (!archiveRow) throw new Error("statement_archive_not_created");
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
              periodLabel: preview.payload.periodLabel,
              canonicalPayloadHash: preview.canonicalPayloadHash,
            },
            reason: null,
            at: generatedAt,
            createdAt: generatedAt,
          });
          return "generated" as const;
          });
          if (result === "generated") {
            artifactToCleanup = undefined;
            generated += 1;
          } else {
            reused += 1;
          }
        } catch (error) {
          if (artifactToCleanup && input.deleteArtifact) {
            try {
              await input.deleteArtifact(artifactToCleanup);
            } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], "statement_artifact_rollback_failed");
            }
          }
          throw error;
        }
      }
      return { generated, reused };
    },
  };
}
