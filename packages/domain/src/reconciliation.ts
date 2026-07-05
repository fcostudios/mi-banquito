import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  alert,
  alertAction,
  auditLogEntry,
  contribution,
  contributionCycle,
  expense,
  groupConfig,
  interestAccrual,
  loan,
  loanSchedule,
  loanDisbursement,
  member,
  organization,
  periodClose,
  repayment,
  reconciliationCycle,
  statementArchive,
  withdrawal,
} from "@mi-banquito/db/schema";
import { type AuditWriter, writeWithAudit } from "./audit";
import { effectiveAlertState } from "./alerts";
import { canonicalJson, sha256Hex } from "./reporting";

const DEFAULT_ADJUSTMENT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AdjustmentWindowInput = {
  openedAt: Date;
  days?: number;
};

export type AdjustmentWindow = {
  opensAt: Date;
  closesAt: Date;
};

export type ReconciliationStatus = "within_tolerance" | "outside_tolerance" | "annotated" | "closed";

export type ReconciliationClassificationInput = {
  declaredBankBalance: string;
  computedPoolBalance: string;
  toleranceAmount: string;
  resolutionKind: string;
  periodCloseId: string | null;
};

export type ReconciliationClassification = {
  discrepancyAmount: string;
  status: ReconciliationStatus;
  closeAllowed: boolean;
};

export type ReconciliationSnapshot = {
  id: string;
  orgId: string;
  cycleId: string;
  cycleLabel: string;
  declaredBankBalance: string;
  computedPoolBalance: string;
  discrepancyAmount: string;
  toleranceAmount: string;
  status: ReconciliationStatus;
  resolutionKind: string;
  resolutionNote: string | null;
  periodCloseId: string | null;
  monthlyCloseStatementId: string | null;
  monthlyClosePdfUri: string | null;
  canonicalPayloadHash: string | null;
};

export type ExecuteReconciliationInput = {
  orgId: string;
  actorId: string;
  cycleId: string;
  declaredBankBalance: string;
};

export type AnnotateReconciliationInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
  reason: string;
};

export type ClosePeriodInput = {
  orgId: string;
  actorId: string;
  reconciliationCycleId: string;
};

export type ShareMonthlyCloseInput = {
  orgId: string;
  actorId: string;
  statementArchiveId: string;
};

export type MonthlyCloseShareResult = {
  whatsappUrl: string;
};

export type MonthlyCloseArtifactInput = {
  orgId: string;
  periodLabel: string;
  canonicalPayloadHash: string;
  payload: ReturnType<typeof monthlyClosePayload>;
};

export type MonthlyCloseArtifactResult = {
  pdfUri: string;
  byteSize: number;
};

export type MonthlyCloseArtifactWriter = (input: MonthlyCloseArtifactInput) => Promise<MonthlyCloseArtifactResult>;

export function buildAdjustmentWindow({ openedAt, days = DEFAULT_ADJUSTMENT_WINDOW_DAYS }: AdjustmentWindowInput): AdjustmentWindow {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("adjustment window days must be positive");
  }

  return {
    opensAt: openedAt,
    closesAt: new Date(openedAt.getTime() + days * MS_PER_DAY),
  };
}

function decimal(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("amount_must_be_numeric");
  }
  return parsed;
}

function money4(value: string | number): string {
  return Number(value).toFixed(4);
}

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function periodLabelFromDate(date: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function cycleLabelOf(row: Pick<typeof contributionCycle.$inferSelect, "cycleLabel" | "opensOn">): string {
  if (row.cycleLabel?.trim()) {
    return row.cycleLabel;
  }
  return periodLabelFromDate(new Date(`${row.opensOn}T00:00:00.000Z`));
}

export function classifyReconciliation(input: ReconciliationClassificationInput): ReconciliationClassification {
  const discrepancy = decimal(input.declaredBankBalance) - decimal(input.computedPoolBalance);
  const tolerance = Math.abs(decimal(input.toleranceAmount));

  if (input.periodCloseId) {
    return {
      discrepancyAmount: money4(discrepancy),
      status: "closed",
      closeAllowed: false,
    };
  }

  if (input.resolutionKind === "annotated_acceptance") {
    return {
      discrepancyAmount: money4(discrepancy),
      status: "annotated",
      closeAllowed: true,
    };
  }

  const withinTolerance = Math.abs(discrepancy) <= tolerance;
  return {
    discrepancyAmount: money4(discrepancy),
    status: withinTolerance ? "within_tolerance" : "outside_tolerance",
    closeAllowed: withinTolerance,
  };
}

export type OpenAdjustmentPeriodInput = {
  orgId: string;
  periodCloseId: string;
  actorId: string;
  reason: string;
  confirmed: boolean;
  days?: number;
};

export type AdjustmentAuditEntry = typeof auditLogEntry.$inferInsert;
export type AdjustmentAuditTx = {
  insert(table: typeof auditLogEntry): {
    values(values: AdjustmentAuditEntry): unknown;
  };
};
export type AdjustmentAuditWriter = AuditWriter<AdjustmentAuditEntry, AdjustmentAuditTx>;

export interface ReconciliationServiceOptions {
  auditWriter?: AdjustmentAuditWriter;
  monthlyCloseArtifactWriter?: MonthlyCloseArtifactWriter;
  now?: () => Date;
}

export interface ReconciliationService {
  readonly context: "reconciliation";
  getMonthlyCloseState(orgId: string): Promise<ReconciliationSnapshot>;
  executeReconciliation(input: ExecuteReconciliationInput): Promise<ReconciliationSnapshot>;
  annotateReconciliation(input: AnnotateReconciliationInput): Promise<ReconciliationSnapshot>;
  closePeriod(input: ClosePeriodInput): Promise<ReconciliationSnapshot>;
  recordMonthlyCloseShareAttempt(input: ShareMonthlyCloseInput): Promise<MonthlyCloseShareResult>;
  openAdjustmentPeriod(input: OpenAdjustmentPeriodInput): Promise<typeof reconciliationCycle.$inferSelect>;
}

const defaultAuditWriter: AdjustmentAuditWriter = async ({ tx, entry }) => {
  await tx.insert(auditLogEntry).values(entry);
};

const sumAmounts = (rows: Array<{ amount: string | number }>): number =>
  rows.reduce((total, row) => total + decimal(String(row.amount)), 0);

function actionsByAlertId(rows: Array<typeof alertAction.$inferSelect>): Map<string, Array<typeof alertAction.$inferSelect>> {
  const grouped = new Map<string, Array<typeof alertAction.$inferSelect>>();
  for (const row of rows) {
    grouped.set(row.alertId, [...(grouped.get(row.alertId) ?? []), row]);
  }
  return grouped;
}

async function deriveCyclePoolBalance(
  tx: {
    select(): {
      from(table: unknown): {
        where(...args: unknown[]): unknown;
      };
    };
  },
  input: {
    orgId: string;
    cycle: Pick<typeof contributionCycle.$inferSelect, "id" | "opensOn" | "closesOn">;
  },
): Promise<string> {
  const [contributions, repayments, withdrawals, expenses, disbursements] = await Promise.all([
    tx.select().from(contribution)
      .where(and(
        eq(contribution.orgId, input.orgId),
        lte(contribution.datedOn, input.cycle.closesOn),
        isNull(contribution.reversesId),
      )) as Promise<Array<{ amount: string | number }>>,
    tx.select().from(repayment)
      .where(and(
        eq(repayment.orgId, input.orgId),
        lte(repayment.datedOn, input.cycle.closesOn),
        isNull(repayment.reversesId),
      )) as Promise<Array<{ amount: string | number }>>,
    tx.select().from(withdrawal)
      .where(and(
        eq(withdrawal.orgId, input.orgId),
        lte(withdrawal.datedOn, input.cycle.closesOn),
        isNull(withdrawal.reversesId),
      )) as Promise<Array<{ amount: string | number }>>,
    tx.select().from(expense)
      .where(and(
        eq(expense.orgId, input.orgId),
        lte(expense.incurredOn, input.cycle.closesOn),
        isNull(expense.reversesId),
      )) as Promise<Array<{ amount: string | number }>>,
    tx.select().from(loanDisbursement)
      .where(and(
        eq(loanDisbursement.orgId, input.orgId),
        lte(loanDisbursement.disbursedOn, input.cycle.closesOn),
      )) as Promise<Array<{ amount: string | number }>>,
  ]);

  return money4(
    sumAmounts(contributions)
    + sumAmounts(repayments)
    - sumAmounts(withdrawals)
    - sumAmounts(expenses)
    - sumAmounts(disbursements),
  );
}

async function buildMonthlyCloseEvidence(
  tx: { select(): any },
  input: {
    orgId: string;
    cycle: Pick<typeof contributionCycle.$inferSelect, "opensOn" | "closesOn">;
  },
) {
  const [orgRows, contributionRows, repaymentRows, withdrawalRows, expenseRows, disbursementRows, memberRows, loanRows, scheduleRows, alertRows, alertActionRows, accrualRows] = await Promise.all([
    tx.select().from(organization)
      .where(eq(organization.id, input.orgId)) as Promise<Array<typeof organization.$inferSelect>>,
    tx.select().from(contribution)
      .where(and(eq(contribution.orgId, input.orgId), gte(contribution.datedOn, input.cycle.opensOn), lte(contribution.datedOn, input.cycle.closesOn), isNull(contribution.reversesId)))
      .orderBy(contribution.datedOn) as Promise<Array<typeof contribution.$inferSelect>>,
    tx.select().from(repayment)
      .where(and(eq(repayment.orgId, input.orgId), gte(repayment.datedOn, input.cycle.opensOn), lte(repayment.datedOn, input.cycle.closesOn), isNull(repayment.reversesId)))
      .orderBy(repayment.datedOn) as Promise<Array<typeof repayment.$inferSelect>>,
    tx.select().from(withdrawal)
      .where(and(eq(withdrawal.orgId, input.orgId), gte(withdrawal.datedOn, input.cycle.opensOn), lte(withdrawal.datedOn, input.cycle.closesOn), isNull(withdrawal.reversesId)))
      .orderBy(withdrawal.datedOn) as Promise<Array<typeof withdrawal.$inferSelect>>,
    tx.select().from(expense)
      .where(and(eq(expense.orgId, input.orgId), gte(expense.incurredOn, input.cycle.opensOn), lte(expense.incurredOn, input.cycle.closesOn), isNull(expense.reversesId)))
      .orderBy(expense.incurredOn) as Promise<Array<typeof expense.$inferSelect>>,
    tx.select().from(loanDisbursement)
      .where(and(eq(loanDisbursement.orgId, input.orgId), gte(loanDisbursement.disbursedOn, input.cycle.opensOn), lte(loanDisbursement.disbursedOn, input.cycle.closesOn)))
      .orderBy(loanDisbursement.disbursedOn) as Promise<Array<typeof loanDisbursement.$inferSelect>>,
    tx.select().from(member)
      .where(eq(member.orgId, input.orgId))
      .orderBy(member.displayName) as Promise<Array<typeof member.$inferSelect>>,
    tx.select().from(loan)
      .where(eq(loan.orgId, input.orgId))
      .orderBy(loan.createdAt) as Promise<Array<typeof loan.$inferSelect>>,
    tx.select().from(loanSchedule)
      .where(eq(loanSchedule.orgId, input.orgId))
      .orderBy(loanSchedule.dueOn) as Promise<Array<typeof loanSchedule.$inferSelect>>,
    tx.select().from(alert)
      .where(eq(alert.orgId, input.orgId))
      .orderBy(alert.createdAt) as Promise<Array<typeof alert.$inferSelect>>,
    tx.select().from(alertAction)
      .where(eq(alertAction.orgId, input.orgId))
      .orderBy(alertAction.createdAt) as Promise<Array<typeof alertAction.$inferSelect>>,
    tx.select().from(interestAccrual)
      .where(and(eq(interestAccrual.orgId, input.orgId), gte(interestAccrual.accruedOn, input.cycle.opensOn), lte(interestAccrual.accruedOn, input.cycle.closesOn)))
      .orderBy(interestAccrual.accruedOn) as Promise<Array<typeof interestAccrual.$inferSelect>>,
  ]);
  const [org] = orgRows;
  const groupedAlertActions = actionsByAlertId(alertActionRows);
  const contributionByMember = new Map<string, number>();
  const withdrawalByMember = new Map<string, number>();
  for (const row of contributionRows) {
    contributionByMember.set(row.memberId, (contributionByMember.get(row.memberId) ?? 0) + decimal(String(row.amount)));
  }
  for (const row of withdrawalRows) {
    withdrawalByMember.set(row.memberId, (withdrawalByMember.get(row.memberId) ?? 0) + decimal(String(row.amount)));
  }

  return {
    branding: {
      orgName: org?.displayName ?? input.orgId,
      logoUri: org?.brandingLogoUri ?? null,
      currencyCode: org?.currencyCode ?? "USD",
    },
    ledgerEntries: [
      ...contributionRows.map((row) => ({ kind: "contribution", datedOn: row.datedOn, memberId: row.memberId, amount: money4(String(row.amount)), note: row.notes })),
      ...repaymentRows.map((row) => ({ kind: "repayment", datedOn: row.datedOn, memberId: row.memberId, amount: money4(String(row.amount)), note: row.notes })),
      ...withdrawalRows.map((row) => ({ kind: "withdrawal", datedOn: row.datedOn, memberId: row.memberId, amount: money4(String(row.amount)), note: row.notes })),
      ...expenseRows.map((row) => ({ kind: "expense", datedOn: row.incurredOn, memberId: row.beneficiaryMemberId, amount: money4(String(row.amount)), note: row.purpose })),
      ...disbursementRows.map((row) => ({ kind: "loan_disbursement", datedOn: row.disbursedOn, memberId: null, amount: money4(String(row.amount)), note: row.loanId })),
    ].sort((a, b) => `${a.datedOn}-${a.kind}-${a.amount}`.localeCompare(`${b.datedOn}-${b.kind}-${b.amount}`)),
    memberBalances: memberRows.map((row) => ({
      memberId: row.id,
      displayName: row.displayName,
      status: row.status,
      monthNet: money4((contributionByMember.get(row.id) ?? 0) - (withdrawalByMember.get(row.id) ?? 0)),
      closingSavingsEstimate: money4(decimal(String(row.initialSavingsBalance)) + (contributionByMember.get(row.id) ?? 0) - (withdrawalByMember.get(row.id) ?? 0)),
    })),
    openLoans: loanRows
      .filter((row) => ["originated", "activo", "en_mora"].includes(row.status))
      .map((row) => {
        const nextDue = scheduleRows.find((schedule) => schedule.loanId === row.id && schedule.status !== "pagado");
        return {
          loanId: row.id,
          borrowerKind: row.borrowerKind,
          borrowerMemberId: row.borrowerMemberId,
          borrowerNonMemberId: row.borrowerNonMemberId,
          principalAmount: money4(String(row.principalAmount)),
          status: row.status,
          nextDueOn: nextDue?.dueOn ?? null,
          nextDueAmount: nextDue ? money4(decimal(String(nextDue.principalDue)) + decimal(String(nextDue.interestDue))) : null,
        };
      }),
    activeAlerts: alertRows
      .filter((row) => effectiveAlertState({
        alert: row,
        actions: groupedAlertActions.get(row.id) ?? [],
        now: new Date(`${input.cycle.closesOn}T23:59:59.999Z`),
      }).visible)
      .map((row) => ({
        alertId: row.id,
        alertKind: row.alertKind,
        severity: row.severity,
        audience: row.audience,
        subjectKind: row.subjectKind,
        subjectId: row.subjectId,
        createdAt: dateValue(row.createdAt).toISOString(),
      })),
    interestAccruals: accrualRows.map((row) => ({
      loanId: row.loanId,
      accruedOn: row.accruedOn,
      principalBasis: money4(String(row.principalBasis)),
      interestAmount: money4(String(row.interestAmount)),
    })),
  };
}

const requireAdjustmentReason = (reason: string): string => {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("reason is required to open an adjustment period");
  }
  return trimmed;
};

const requireAnnotationReason = (reason: string): string => {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    throw new Error("annotation_reason_min_length");
  }
  return trimmed;
};

function snapshotFromRows(input: {
  orgId: string;
  cycle: typeof contributionCycle.$inferSelect;
  reconciliation: typeof reconciliationCycle.$inferSelect;
  periodCloseId?: string | null;
  statement?: typeof statementArchive.$inferSelect | null;
}): ReconciliationSnapshot {
  const classification = classifyReconciliation({
    declaredBankBalance: String(input.reconciliation.declaredBankBalance),
    computedPoolBalance: String(input.reconciliation.computedPoolBalance),
    toleranceAmount: String(input.reconciliation.toleranceAmount),
    resolutionKind: input.reconciliation.resolutionKind,
    periodCloseId: input.periodCloseId ?? input.reconciliation.periodCloseId,
  });
  return {
    id: input.reconciliation.id,
    orgId: input.orgId,
    cycleId: input.reconciliation.cycleId,
    cycleLabel: cycleLabelOf(input.cycle),
    declaredBankBalance: money4(String(input.reconciliation.declaredBankBalance)),
    computedPoolBalance: money4(String(input.reconciliation.computedPoolBalance)),
    discrepancyAmount: classification.discrepancyAmount,
    toleranceAmount: money4(String(input.reconciliation.toleranceAmount)),
    status: classification.status,
    resolutionKind: input.reconciliation.resolutionKind,
    resolutionNote: input.reconciliation.resolutionNote,
    periodCloseId: input.periodCloseId ?? input.reconciliation.periodCloseId,
    monthlyCloseStatementId: input.statement?.id ?? null,
    monthlyClosePdfUri: input.statement?.pdfUri ?? null,
    canonicalPayloadHash: input.statement?.canonicalPayloadHash ?? null,
  };
}

function emptySnapshot(input: {
  orgId: string;
  cycle: typeof contributionCycle.$inferSelect;
  computedPoolBalance: string;
  toleranceAmount: string;
}): ReconciliationSnapshot {
  const classification = classifyReconciliation({
    declaredBankBalance: input.computedPoolBalance,
    computedPoolBalance: input.computedPoolBalance,
    toleranceAmount: input.toleranceAmount,
    resolutionKind: "auto_within_tolerance",
    periodCloseId: null,
  });
  return {
    id: "",
    orgId: input.orgId,
    cycleId: input.cycle.id,
    cycleLabel: cycleLabelOf(input.cycle),
    declaredBankBalance: input.computedPoolBalance,
    computedPoolBalance: input.computedPoolBalance,
    discrepancyAmount: classification.discrepancyAmount,
    toleranceAmount: money4(input.toleranceAmount),
    status: classification.status,
    resolutionKind: "auto_within_tolerance",
    resolutionNote: null,
    periodCloseId: null,
    monthlyCloseStatementId: null,
    monthlyClosePdfUri: null,
    canonicalPayloadHash: null,
  };
}

function monthlyClosePayload(input: {
  orgId: string;
  branding: {
    orgName: string;
    logoUri: string | null;
    currencyCode: string;
  };
  cycleLabel: string;
  periodCloseId: string;
  reconciliation: typeof reconciliationCycle.$inferSelect;
  closedAt: Date | string;
  ledgerEntries?: Array<Record<string, string | null>>;
  memberBalances?: Array<Record<string, string | null>>;
  openLoans?: Array<Record<string, string | null>>;
  activeAlerts?: Array<Record<string, string | null>>;
  interestAccruals?: Array<Record<string, string | null>>;
}) {
  return {
    kind: "monthly_close",
    orgId: input.orgId,
    branding: input.branding,
    cycleId: input.reconciliation.cycleId,
    cycleLabel: input.cycleLabel,
    periodCloseId: input.periodCloseId,
    declaredBankBalance: money4(String(input.reconciliation.declaredBankBalance)),
    computedPoolBalance: money4(String(input.reconciliation.computedPoolBalance)),
    discrepancyAmount: money4(String(input.reconciliation.discrepancyAmount)),
    toleranceAmount: money4(String(input.reconciliation.toleranceAmount)),
    resolutionKind: input.reconciliation.resolutionKind,
    resolutionNote: input.reconciliation.resolutionNote,
    closedAt: dateValue(input.closedAt).toISOString(),
    ledgerEntries: input.ledgerEntries ?? [],
    memberBalances: input.memberBalances ?? [],
    openLoans: input.openLoans ?? [],
    activeAlerts: input.activeAlerts ?? [],
    interestAccruals: input.interestAccruals ?? [],
  };
}

export function monthlyCloseShareUrl(pdfUri: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Revisa el cierre del mes: ${pdfUri}`)}`;
}

export const createReconciliationService = (options: ReconciliationServiceOptions = {}): ReconciliationService => {
  const auditWriter = options.auditWriter ?? defaultAuditWriter;
  const monthlyCloseArtifactWriter = options.monthlyCloseArtifactWriter;
  const now = options.now ?? (() => new Date());

  return {
    context: "reconciliation",
    async getMonthlyCloseState(orgId) {
      return withTenantTransaction(orgId, async (tx) => {
        const [cycle] = await tx.select().from(contributionCycle)
          .where(and(eq(contributionCycle.orgId, orgId), eq(contributionCycle.status, "open")))
          .orderBy(desc(contributionCycle.opensOn))
          .limit(1);
        if (!cycle) {
          throw new Error("open_contribution_cycle_not_found");
        }

        const [config] = await tx.select({
          reconciliationToleranceAmount: groupConfig.reconciliationToleranceAmount,
        }).from(groupConfig)
          .where(and(eq(groupConfig.orgId, orgId), isNull(groupConfig.validTo)))
          .orderBy(desc(groupConfig.version))
          .limit(1);
        if (!config) {
          throw new Error("group_config_not_found");
        }

        const computedPoolBalance = await deriveCyclePoolBalance(tx, { orgId, cycle });

        const [reconciliation] = await tx.select().from(reconciliationCycle)
          .where(and(
            eq(reconciliationCycle.orgId, orgId),
            eq(reconciliationCycle.cycleId, cycle.id),
          ))
          .orderBy(desc(reconciliationCycle.createdAt))
          .limit(1);
        if (!reconciliation) {
          return emptySnapshot({
            orgId,
            cycle,
            computedPoolBalance,
            toleranceAmount: String(config.reconciliationToleranceAmount),
          });
        }

        const [closeRow] = reconciliation.periodCloseId
          ? await tx.select().from(periodClose)
            .where(and(eq(periodClose.orgId, orgId), eq(periodClose.id, reconciliation.periodCloseId)))
            .limit(1)
          : [];
        const [archive] = closeRow
          ? await tx.select().from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, orgId),
              eq(statementArchive.periodCloseId, closeRow.id),
              eq(statementArchive.kind, "monthly_close"),
            ))
            .limit(1)
          : [];

        return snapshotFromRows({
          orgId,
          cycle,
          reconciliation,
          periodCloseId: closeRow?.id ?? reconciliation.periodCloseId,
          statement: archive ?? null,
        });
      });
    },
    async executeReconciliation(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const writtenAt = now();
        let snapshot: ReconciliationSnapshot | undefined;
        let auditEntry: AdjustmentAuditEntry | undefined;

        return writeWithAudit({
          write: async () => {
            const [cycle] = await tx.select().from(contributionCycle)
              .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.id, input.cycleId)))
              .limit(1);
            if (!cycle) {
              throw new Error("contribution_cycle_not_found");
            }
            const [lockedClose] = await tx.select().from(periodClose)
              .where(and(eq(periodClose.orgId, input.orgId), eq(periodClose.cycleId, input.cycleId)))
              .limit(1);
            if (lockedClose) {
              throw new Error("period_locked");
            }

            const [config] = await tx.select({
              reconciliationToleranceAmount: groupConfig.reconciliationToleranceAmount,
            }).from(groupConfig)
              .where(and(eq(groupConfig.orgId, input.orgId), isNull(groupConfig.validTo)))
              .orderBy(desc(groupConfig.version))
              .limit(1);
            if (!config) {
              throw new Error("group_config_not_found");
            }

            const computedPoolBalance = await deriveCyclePoolBalance(tx, { orgId: input.orgId, cycle });
            const classification = classifyReconciliation({
              declaredBankBalance: input.declaredBankBalance,
              computedPoolBalance,
              toleranceAmount: String(config.reconciliationToleranceAmount),
              resolutionKind: "auto_within_tolerance",
              periodCloseId: null,
            });

            const [existing] = await tx.select().from(reconciliationCycle)
              .where(and(
                eq(reconciliationCycle.orgId, input.orgId),
                eq(reconciliationCycle.cycleId, input.cycleId),
                isNull(reconciliationCycle.periodCloseId),
              ))
              .limit(1);

            const values = {
              orgId: input.orgId,
              cycleId: input.cycleId,
              declaredBankBalance: money4(input.declaredBankBalance),
              computedPoolBalance,
              discrepancyAmount: classification.discrepancyAmount,
              toleranceAmount: money4(String(config.reconciliationToleranceAmount)),
              resolutionKind: "auto_within_tolerance" as const,
              resolutionNote: null,
              closedAt: null,
              periodCloseId: null,
              createdAt: writtenAt,
              createdBy: input.actorId,
              createdByKind: "member",
            };

            const [row] = existing
              ? await tx.update(reconciliationCycle).set(values).where(eq(reconciliationCycle.id, existing.id)).returning()
              : await tx.insert(reconciliationCycle).values(values).returning();

            const [existingA7] = await tx.select().from(alert)
              .where(and(
                eq(alert.orgId, input.orgId),
                eq(alert.alertKind, "A7"),
                eq(alert.subjectKind, "reconciliation_cycle"),
                eq(alert.subjectId, row.id),
              ))
              .limit(1);

            if (classification.status === "outside_tolerance") {
              if (!existingA7) {
                await tx.insert(alert).values({
                  orgId: input.orgId,
                  alertKind: "A7",
                  severity: "critical" as const,
                  audience: "treasurer" as const,
                  subjectKind: "reconciliation_cycle",
                  subjectId: row.id,
                  payload: {
                    title: "Discrepancia bancaria detectada",
                    body: `Declarado ${values.declaredBankBalance}; libros ${computedPoolBalance}; diferencia ${classification.discrepancyAmount}.`,
                    declaredBankBalance: values.declaredBankBalance,
                    computedPoolBalance,
                    discrepancyAmount: classification.discrepancyAmount,
                  },
                  dedupWindowEnd: new Date(writtenAt.getTime() + MS_PER_DAY),
                  createdAt: writtenAt,
                });
              }
            } else if (existingA7) {
              await tx.insert(alertAction).values({
                orgId: input.orgId,
                alertId: existingA7.id,
                actionKind: "dismiss",
                snoozedUntil: null,
                actorId: input.actorId,
                actorKind: "member",
                reason: "Discrepancia dentro de tolerancia",
                createdAt: writtenAt,
              });
            }

            snapshot = snapshotFromRows({
              orgId: input.orgId,
              cycle,
              reconciliation: row,
              periodCloseId: null,
              statement: null,
            });

            auditEntry = {
              orgId: input.orgId,
              actorKind: "member",
              actorId: input.actorId,
              actionKind: "reconciliation.execute",
              subjectKind: "reconciliation_cycle",
              subjectId: row.id,
              payloadSnapshot: snapshot,
              reason: null,
              at: writtenAt,
              createdAt: writtenAt,
            };

            return snapshot;
          },
          audit: async () => {
            if (!auditEntry) {
              throw new Error("reconciliation audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
    },
    async annotateReconciliation(input) {
      const reason = requireAnnotationReason(input.reason);
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const writtenAt = now();
        let snapshot: ReconciliationSnapshot | undefined;
        let auditEntry: AdjustmentAuditEntry | undefined;

        return writeWithAudit({
          write: async () => {
            const [existing] = await tx.select().from(reconciliationCycle)
              .where(and(
                eq(reconciliationCycle.orgId, input.orgId),
                eq(reconciliationCycle.id, input.reconciliationCycleId),
              ))
              .limit(1);
            if (!existing) {
              throw new Error("reconciliation_cycle_not_found");
            }
            if (existing.periodCloseId) {
              throw new Error("period_locked");
            }

            const [cycle] = await tx.select().from(contributionCycle)
              .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.id, existing.cycleId)))
              .limit(1);
            if (!cycle) {
              throw new Error("contribution_cycle_not_found");
            }
            const [lockedClose] = await tx.select().from(periodClose)
              .where(and(eq(periodClose.orgId, input.orgId), eq(periodClose.cycleId, existing.cycleId)))
              .limit(1);
            if (lockedClose) {
              throw new Error("period_locked");
            }

            const [row] = await tx.update(reconciliationCycle).set({
              resolutionKind: "annotated_acceptance",
              resolutionNote: reason,
            }).where(eq(reconciliationCycle.id, existing.id)).returning();

            snapshot = snapshotFromRows({
              orgId: input.orgId,
              cycle,
              reconciliation: row,
              periodCloseId: null,
              statement: null,
            });

            auditEntry = {
              orgId: input.orgId,
              actorKind: "member",
              actorId: input.actorId,
              actionKind: "reconciliation.annotate",
              subjectKind: "reconciliation_cycle",
              subjectId: row.id,
              payloadSnapshot: {
                priorResolutionKind: existing.resolutionKind,
                newResolutionKind: row.resolutionKind,
                reason,
              },
              reason,
              at: writtenAt,
              createdAt: writtenAt,
            };

            return snapshot;
          },
          audit: async () => {
            if (!auditEntry) {
              throw new Error("reconciliation annotation audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
    },
    async closePeriod(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const closedAt = now();
        let auditEntry: AdjustmentAuditEntry | undefined;

        return writeWithAudit({
          write: async () => {
            const [reconciliation] = await tx.select().from(reconciliationCycle)
              .where(and(
                eq(reconciliationCycle.orgId, input.orgId),
                eq(reconciliationCycle.id, input.reconciliationCycleId),
              ))
              .limit(1);
            if (!reconciliation) {
              throw new Error("reconciliation_cycle_not_found");
            }

            const [cycle] = await tx.select().from(contributionCycle)
              .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.id, reconciliation.cycleId)))
              .limit(1);
            if (!cycle) {
              throw new Error("contribution_cycle_not_found");
            }

            const classification = classifyReconciliation({
              declaredBankBalance: String(reconciliation.declaredBankBalance),
              computedPoolBalance: String(reconciliation.computedPoolBalance),
              toleranceAmount: String(reconciliation.toleranceAmount),
              resolutionKind: reconciliation.resolutionKind,
              periodCloseId: reconciliation.periodCloseId,
            });
            if (!classification.closeAllowed && !reconciliation.periodCloseId) {
              throw new Error("reconciliation_not_ready_to_close");
            }

            let [existingClose] = await tx.select().from(periodClose)
              .where(and(
                eq(periodClose.orgId, input.orgId),
                eq(periodClose.cycleId, reconciliation.cycleId),
              ))
              .limit(1);

            if (!existingClose) {
              const [insertedClose] = await tx.insert(periodClose).values({
                orgId: input.orgId,
                cycleId: reconciliation.cycleId,
                reconciliationCycleId: reconciliation.id,
                closedAt,
                closedBy: input.actorId,
                closedByKind: "member",
                isYearEnd: false,
                monthlyCloseStatementId: null,
                createdAt: closedAt,
              }).onConflictDoNothing({
                target: [periodClose.orgId, periodClose.cycleId],
              }).returning();
              existingClose = insertedClose;
            }
            if (!existingClose) {
              [existingClose] = await tx.select().from(periodClose)
                .where(and(
                  eq(periodClose.orgId, input.orgId),
                  eq(periodClose.cycleId, reconciliation.cycleId),
                ))
                .limit(1);
            }
            if (!existingClose) {
              throw new Error("period_close_not_found_after_insert");
            }
            const closeRow = existingClose;

            const [closedReconciliation] = reconciliation.periodCloseId
              ? [reconciliation]
              : await tx.update(reconciliationCycle).set({
                closedAt: closeRow.closedAt,
                periodCloseId: closeRow.id,
              }).where(eq(reconciliationCycle.id, reconciliation.id)).returning();

            const [a7] = await tx.select().from(alert)
              .where(and(
                eq(alert.orgId, input.orgId),
                eq(alert.alertKind, "A7"),
                eq(alert.subjectKind, "reconciliation_cycle"),
                eq(alert.subjectId, reconciliation.id),
              ))
              .limit(1);
            if (a7) {
              await tx.insert(alertAction).values({
                orgId: input.orgId,
                alertId: a7.id,
                actionKind: "dismiss",
                snoozedUntil: null,
                actorId: input.actorId,
                actorKind: "member",
                reason: "Periodo cerrado",
                createdAt: closedAt,
              });
            }

            const [existingArchive] = await tx.select().from(statementArchive)
              .where(and(
                eq(statementArchive.orgId, input.orgId),
                eq(statementArchive.periodCloseId, closeRow.id),
                eq(statementArchive.kind, "monthly_close"),
              ))
              .limit(1);

            const evidence = await buildMonthlyCloseEvidence(tx, {
              orgId: input.orgId,
              cycle,
            });
            const payload = monthlyClosePayload({
              orgId: input.orgId,
              branding: evidence.branding,
              cycleLabel: cycleLabelOf(cycle),
              periodCloseId: closeRow.id,
              reconciliation: closedReconciliation,
              closedAt: closeRow.closedAt,
              ledgerEntries: evidence.ledgerEntries,
              memberBalances: evidence.memberBalances,
              openLoans: evidence.openLoans,
              activeAlerts: evidence.activeAlerts,
              interestAccruals: evidence.interestAccruals,
            });
            const hash = sha256Hex(canonicalJson(payload));
            const artifact = monthlyCloseArtifactWriter
              ? await monthlyCloseArtifactWriter({
                orgId: input.orgId,
                periodLabel: cycleLabelOf(cycle),
                canonicalPayloadHash: hash,
                payload,
              })
              : {
                pdfUri: `/statement-archive/monthly-close/${hash}.pdf`,
                byteSize: Buffer.byteLength(canonicalJson(payload), "utf8"),
              };

            let archiveRow = existingArchive;
            if (!archiveRow) {
              const [insertedArchive] = await tx.insert(statementArchive).values({
                orgId: input.orgId,
                kind: "monthly_close",
                memberId: null,
                periodLabel: cycleLabelOf(cycle),
                pdfUri: artifact.pdfUri,
                canonicalPayloadHash: hash,
                generatedAt: closedAt,
                periodCloseId: closeRow.id,
                yearEndShareOutId: null,
                byteSize: artifact.byteSize,
                createdAt: closedAt,
                createdByKind: "system",
              }).onConflictDoNothing().returning();
              archiveRow = insertedArchive;
            }
            if (!archiveRow) {
              [archiveRow] = await tx.select().from(statementArchive)
                .where(and(
                  eq(statementArchive.orgId, input.orgId),
                  eq(statementArchive.periodCloseId, closeRow.id),
                  eq(statementArchive.kind, "monthly_close"),
                ))
                .limit(1);
            }
            if (!archiveRow) {
              throw new Error("statement_archive_not_found_after_insert");
            }

            auditEntry = {
              orgId: input.orgId,
              actorKind: "member",
              actorId: input.actorId,
              actionKind: "period_close.create",
              subjectKind: "period_close",
              subjectId: closeRow.id,
              payloadSnapshot: {
                periodCloseId: closeRow.id,
                statementArchiveId: archiveRow.id,
                canonicalPayloadHash: archiveRow.canonicalPayloadHash,
                pdfUri: archiveRow.pdfUri,
              },
              reason: null,
              at: closedAt,
              createdAt: closedAt,
            };

            return snapshotFromRows({
              orgId: input.orgId,
              cycle,
              reconciliation: closedReconciliation,
              periodCloseId: closeRow.id,
              statement: archiveRow,
            });
          },
          audit: async () => {
            if (!auditEntry) {
              throw new Error("period close audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
    },
    async recordMonthlyCloseShareAttempt(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const sharedAt = now();
        const [archive] = await tx.select().from(statementArchive)
          .where(and(
            eq(statementArchive.orgId, input.orgId),
            eq(statementArchive.id, input.statementArchiveId),
            eq(statementArchive.kind, "monthly_close"),
          ))
          .limit(1);
        if (!archive) {
          throw new Error("monthly_close_statement_not_found");
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "statement_archive.share_whatsapp",
          subjectKind: "statement_archive",
          subjectId: archive.id,
          payloadSnapshot: {
            pdfUri: archive.pdfUri,
            canonicalPayloadHash: archive.canonicalPayloadHash,
          },
          reason: null,
          at: sharedAt,
          createdAt: sharedAt,
        });

        return { whatsappUrl: monthlyCloseShareUrl(archive.pdfUri) };
      });
    },
    async openAdjustmentPeriod(input) {
      const reason = requireAdjustmentReason(input.reason);
      if (input.confirmed !== true) {
        throw new Error("confirmation is required to open an adjustment period");
      }

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const openedAt = now();
        const window = buildAdjustmentWindow({ openedAt, days: input.days });
        let auditEntry: AdjustmentAuditEntry | undefined;
        let isIdempotentReplay = false;

        return writeWithAudit({
          write: async () => {
            const [closedPeriod] = await tx.select().from(periodClose)
              .where(and(
                eq(periodClose.id, input.periodCloseId),
                eq(periodClose.orgId, input.orgId),
              ));

            if (!closedPeriod) {
              throw new Error("period close not found");
            }

            const [existingAdjustment] = await tx.select().from(reconciliationCycle)
              .where(and(
                eq(reconciliationCycle.orgId, input.orgId),
                eq(reconciliationCycle.periodCloseId, closedPeriod.id),
                eq(reconciliationCycle.resolutionKind, "adjustment"),
              ));

            if (existingAdjustment) {
              isIdempotentReplay = true;
              return existingAdjustment;
            }

            const [adjustmentCycle] = await tx.insert(reconciliationCycle).values({
              orgId: input.orgId,
              cycleId: closedPeriod.cycleId,
              declaredBankBalance: "0.0000",
              computedPoolBalance: "0.0000",
              discrepancyAmount: "0.0000",
              toleranceAmount: "0.0000",
              resolutionKind: "adjustment",
              resolutionNote: null,
              closedAt: null,
              periodCloseId: closedPeriod.id,
              adjustmentReason: reason,
              adjustmentWindowOpensAt: window.opensAt,
              adjustmentWindowClosesAt: window.closesAt,
              createdAt: openedAt,
              createdBy: input.actorId,
              createdByKind: "platform_operator",
            }).returning();

            await tx.insert(alert).values({
              orgId: input.orgId,
              alertKind: "adjustment_period_opened",
              severity: "low",
              audience: "both",
              subjectKind: "period_close",
              subjectId: closedPeriod.id,
              payload: {
                adjustmentCycleId: adjustmentCycle.id,
                periodCloseId: closedPeriod.id,
                reason,
                windowOpensAt: window.opensAt.toISOString(),
                windowClosesAt: window.closesAt.toISOString(),
              },
              dedupWindowEnd: window.closesAt,
              createdAt: openedAt,
            });

            auditEntry = {
              orgId: input.orgId,
              actorKind: "platform_operator",
              actorId: input.actorId,
              actionKind: "adjustment_period.open",
              subjectKind: "period_close",
              subjectId: closedPeriod.id,
              payloadSnapshot: {
                adjustmentCycleId: adjustmentCycle.id,
                periodCloseId: closedPeriod.id,
                cycleId: closedPeriod.cycleId,
                reason,
                windowOpensAt: window.opensAt.toISOString(),
                windowClosesAt: window.closesAt.toISOString(),
              },
              reason,
              at: openedAt,
              createdAt: openedAt,
            };

            return adjustmentCycle;
          },
          audit: async () => {
            if (isIdempotentReplay) {
              return;
            }
            if (!auditEntry) {
              throw new Error("adjustment period audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
    },
  };
};
