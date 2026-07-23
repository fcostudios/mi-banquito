import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { lockTenantMoneyWrites, withSystemTenantTransaction, withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  alert,
  alertAction,
  account,
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
  statementArtifactEvent,
  withdrawal,
  transfer,
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
  closeAllowed: boolean;
  resolutionKind: string;
  resolutionNote: string | null;
  periodCloseId: string | null;
  monthlyCloseStatementId: string | null;
  monthlyClosePdfUri: string | null;
  canonicalPayloadHash: string | null;
  monthlyCloseArtifactStatus: "pending" | "failed" | "ready" | null;
  pendingRegularizations: PendingRegularization[];
};

export type PendingRegularization = {
  id: string;
  kind: "contribution" | "repayment";
  memberId: string;
  memberName: string;
  accountId: string | null;
  accountName: string | null;
  amount: string;
  datedOn: string;
};

export function canCloseWithPendingRegularizations(rows: Array<{ id: string }>): boolean {
  return rows.length === 0;
}

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

type PendingMonthlyCloseArtifact = MonthlyCloseArtifactInput & {
  statementArchiveId: string;
  attemptNumber: number;
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

function moneyUnits4(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new Error("amount_must_be_numeric");
  const units = BigInt(match[2] ?? "0") * BigInt(10_000) + BigInt((match[3] ?? "").padEnd(4, "0") || "0");
  return match[1] === "-" ? -units : units;
}

function money4(value: string | number): string {
  const units = moneyUnits4(value);
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / BigInt(10_000)}.${String(absolute % BigInt(10_000)).padStart(4, "0")}`;
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

function dateKeyInEcuador(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Guayaquil",
    year: "numeric",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function isPastContributionCycle(
  cycle: Pick<typeof contributionCycle.$inferSelect, "opensOn" | "closesOn">,
  referenceDate: Date,
): boolean {
  return cycle.opensOn < cycle.closesOn && cycle.closesOn < dateKeyInEcuador(referenceDate);
}

export function classifyReconciliation(input: ReconciliationClassificationInput): ReconciliationClassification {
  const discrepancy = moneyUnits4(input.declaredBankBalance) - moneyUnits4(input.computedPoolBalance);
  const toleranceUnits = moneyUnits4(input.toleranceAmount);
  const tolerance = toleranceUnits < BigInt(0) ? -toleranceUnits : toleranceUnits;

  if (input.periodCloseId) {
    return {
      discrepancyAmount: money4FromUnits(discrepancy),
      status: "closed",
      closeAllowed: false,
    };
  }

  if (input.resolutionKind === "annotated_acceptance") {
    return {
      discrepancyAmount: money4FromUnits(discrepancy),
      status: "annotated",
      closeAllowed: true,
    };
  }

  const absoluteDiscrepancy = discrepancy < BigInt(0) ? -discrepancy : discrepancy;
  const withinTolerance = absoluteDiscrepancy <= tolerance;
  return {
    discrepancyAmount: money4FromUnits(discrepancy),
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

function money4FromUnits(units: bigint): string {
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / BigInt(10_000)}.${String(absolute % BigInt(10_000)).padStart(4, "0")}`;
}

const sumAmountUnits = (rows: Array<{ amount: string | number }>): bigint =>
  rows.reduce((total, row) => total + moneyUnits4(row.amount), BigInt(0));

const signedExpenseAmountUnits = (row: { amount: string | number; reversesId: string | null }): bigint => {
  const units = moneyUnits4(row.amount);
  return row.reversesId ? -units : units;
};

const sumSignedExpenseUnits = (
  rows: Array<{ amount: string | number; reversesId: string | null }>,
): bigint => rows.reduce((total, row) => total + signedExpenseAmountUnits(row), BigInt(0));

function actionsByAlertId(rows: Array<typeof alertAction.$inferSelect>): Map<string, Array<typeof alertAction.$inferSelect>> {
  const grouped = new Map<string, Array<typeof alertAction.$inferSelect>>();
  for (const row of rows) {
    grouped.set(row.alertId, [...(grouped.get(row.alertId) ?? []), row]);
  }
  return grouped;
}

async function deriveCyclePoolBalance(
  tx: {
    select(selection?: unknown): {
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
  const contributions = await tx.select({ amount: contribution.amount }).from(contribution)
      .where(and(
        eq(contribution.orgId, input.orgId),
        lte(contribution.datedOn, input.cycle.closesOn),
        isNull(contribution.reversesId),
        eq(contribution.reconciliationStatus, "regularized"),
        sql`(${contribution.accountId} IS NULL OR EXISTS (
          SELECT 1 FROM ${account} fund_account
          WHERE fund_account.id = ${contribution.accountId}
            AND fund_account.org_id = ${input.orgId}
            AND fund_account.is_group_fund = true
        ))`,
      )) as Array<{ amount: string | number }>;
  const repayments = await tx.select({ amount: repayment.amount }).from(repayment)
      .where(and(
        eq(repayment.orgId, input.orgId),
        lte(repayment.datedOn, input.cycle.closesOn),
        isNull(repayment.reversesId),
        eq(repayment.reconciliationStatus, "regularized"),
        sql`(${repayment.accountId} IS NULL OR EXISTS (
          SELECT 1 FROM ${account} fund_account
          WHERE fund_account.id = ${repayment.accountId}
            AND fund_account.org_id = ${input.orgId}
            AND fund_account.is_group_fund = true
        ))`,
      )) as Array<{ amount: string | number }>;
  const withdrawals = await tx.select({ amount: withdrawal.amount }).from(withdrawal)
      .where(and(
        eq(withdrawal.orgId, input.orgId),
        lte(withdrawal.datedOn, input.cycle.closesOn),
        isNull(withdrawal.reversesId),
      )) as Array<{ amount: string | number }>;
  const expenses = await tx.select({ amount: expense.amount, reversesId: expense.reversesId }).from(expense)
      .where(and(
        eq(expense.orgId, input.orgId),
        lte(expense.incurredOn, input.cycle.closesOn),
      )) as Array<{ amount: string | number; reversesId: string | null }>;
  const disbursements = await tx.select({ amount: loanDisbursement.amount }).from(loanDisbursement)
      .where(and(
        eq(loanDisbursement.orgId, input.orgId),
        lte(loanDisbursement.disbursedOn, input.cycle.closesOn),
      )) as Array<{ amount: string | number }>;
  const regularizationResult = await (tx as any).execute(sql`
      SELECT COALESCE(SUM(amount), 0)::numeric(18, 4)::text AS total
      FROM ${transfer}
      WHERE org_id = ${input.orgId}
        AND dated_on <= ${input.cycle.closesOn}
        AND purpose = 'regularization'
        AND reverses_id IS NULL
    `);
  const regularizationRows = Array.isArray(regularizationResult) ? regularizationResult : regularizationResult?.rows ?? [];
  const regularizationTotal = moneyUnits4(String(regularizationRows[0]?.total ?? 0));

  return money4FromUnits(
    sumAmountUnits(contributions)
    + sumAmountUnits(repayments)
    - sumAmountUnits(withdrawals)
    - sumSignedExpenseUnits(expenses)
    - sumAmountUnits(disbursements)
    + regularizationTotal,
  );
}

async function pendingRegularizationsForCycle(
  tx: { execute(query: unknown): Promise<unknown> },
  input: { orgId: string; opensOn: string; closesOn: string },
): Promise<PendingRegularization[]> {
  const result = await tx.execute(sql`
    SELECT source.id,
           source.kind,
           source.member_id AS "memberId",
           m.display_name AS "memberName",
           source.account_id AS "accountId",
           a.name AS "accountName",
           source.amount::numeric(18, 4)::text AS amount,
           source.dated_on::text AS "datedOn"
    FROM (
      SELECT id, 'contribution'::text AS kind, member_id, account_id, amount, dated_on
      FROM contribution
      WHERE org_id = ${input.orgId}
        AND reconciliation_status = 'pending'
        AND reverses_id IS NULL
        AND dated_on >= ${input.opensOn}
        AND dated_on <= ${input.closesOn}
      UNION ALL
      SELECT id, 'repayment'::text AS kind, member_id, account_id, amount, dated_on
      FROM repayment
      WHERE org_id = ${input.orgId}
        AND reconciliation_status = 'pending'
        AND reverses_id IS NULL
        AND dated_on >= ${input.opensOn}
        AND dated_on <= ${input.closesOn}
    ) source
    JOIN member m ON m.id = source.member_id AND m.org_id = ${input.orgId}
    LEFT JOIN account a ON a.id = source.account_id AND a.org_id = ${input.orgId}
    ORDER BY source.dated_on, source.kind, source.id
  `);
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] })?.rows ?? [];
  return rows as PendingRegularization[];
}

async function buildMonthlyCloseEvidence(
  tx: { select(selection?: unknown): any; execute(query: unknown): Promise<unknown> },
  input: {
    orgId: string;
    cycle: Pick<typeof contributionCycle.$inferSelect, "opensOn" | "closesOn">;
  },
) {
  const orgRows = await tx.select().from(organization)
    .where(eq(organization.id, input.orgId)) as Array<typeof organization.$inferSelect>;
  const contributionRows = await tx.select({
      id: contribution.id,
      datedOn: contribution.datedOn,
      memberId: contribution.memberId,
      amount: contribution.amount,
      notes: contribution.notes,
    }).from(contribution)
      .where(and(eq(contribution.orgId, input.orgId), gte(contribution.datedOn, input.cycle.opensOn), lte(contribution.datedOn, input.cycle.closesOn), isNull(contribution.reversesId)))
      .orderBy(contribution.datedOn) as Array<Pick<typeof contribution.$inferSelect, "id" | "datedOn" | "memberId" | "amount" | "notes">>;
  const repaymentRows = await tx.select({
      id: repayment.id,
      datedOn: repayment.datedOn,
      memberId: repayment.memberId,
      amount: repayment.amount,
      notes: repayment.notes,
    }).from(repayment)
      .where(and(eq(repayment.orgId, input.orgId), gte(repayment.datedOn, input.cycle.opensOn), lte(repayment.datedOn, input.cycle.closesOn), isNull(repayment.reversesId)))
      .orderBy(repayment.datedOn) as Array<Pick<typeof repayment.$inferSelect, "id" | "datedOn" | "memberId" | "amount" | "notes">>;
  const withdrawalRows = await tx.select().from(withdrawal)
      .where(and(eq(withdrawal.orgId, input.orgId), gte(withdrawal.datedOn, input.cycle.opensOn), lte(withdrawal.datedOn, input.cycle.closesOn), isNull(withdrawal.reversesId)))
      .orderBy(withdrawal.datedOn) as Array<typeof withdrawal.$inferSelect>;
  const expenseRows = await tx.select().from(expense)
      .where(and(eq(expense.orgId, input.orgId), gte(expense.incurredOn, input.cycle.opensOn), lte(expense.incurredOn, input.cycle.closesOn)))
      .orderBy(expense.incurredOn) as Array<typeof expense.$inferSelect>;
  const disbursementRows = await tx.select().from(loanDisbursement)
      .where(and(eq(loanDisbursement.orgId, input.orgId), gte(loanDisbursement.disbursedOn, input.cycle.opensOn), lte(loanDisbursement.disbursedOn, input.cycle.closesOn)))
      .orderBy(loanDisbursement.disbursedOn) as Array<typeof loanDisbursement.$inferSelect>;
  const memberRows = await tx.select().from(member)
      .where(eq(member.orgId, input.orgId))
      .orderBy(member.displayName) as Array<typeof member.$inferSelect>;
  const loanRows = await tx.select().from(loan)
      .where(eq(loan.orgId, input.orgId))
      .orderBy(loan.createdAt) as Array<typeof loan.$inferSelect>;
  const scheduleRows = await tx.select().from(loanSchedule)
      .where(eq(loanSchedule.orgId, input.orgId))
      .orderBy(loanSchedule.dueOn) as Array<typeof loanSchedule.$inferSelect>;
  const alertRows = await tx.select().from(alert)
      .where(eq(alert.orgId, input.orgId))
      .orderBy(alert.createdAt) as Array<typeof alert.$inferSelect>;
  const alertActionRows = await tx.select().from(alertAction)
      .where(eq(alertAction.orgId, input.orgId))
      .orderBy(alertAction.createdAt) as Array<typeof alertAction.$inferSelect>;
  const accrualRows = await tx.select().from(interestAccrual)
      .where(and(eq(interestAccrual.orgId, input.orgId), gte(interestAccrual.accruedOn, input.cycle.opensOn), lte(interestAccrual.accruedOn, input.cycle.closesOn)))
      .orderBy(interestAccrual.accruedOn) as Array<typeof interestAccrual.$inferSelect>;
  const [org] = orgRows;
  const transferResult = await tx.execute(sql`
    SELECT id, dated_on::text AS "datedOn", amount::numeric(18, 4)::text AS amount,
           purpose, regularizes_kind AS "regularizesKind", regularizes_id AS "regularizesId"
    FROM ${transfer}
    WHERE org_id = ${input.orgId}
      AND dated_on >= ${input.cycle.opensOn}
      AND dated_on <= ${input.cycle.closesOn}
      AND reverses_id IS NULL
    ORDER BY dated_on, id
  `);
  const transferRows = (Array.isArray(transferResult) ? transferResult : (transferResult as { rows?: any[] })?.rows ?? []) as Array<Record<string, any>>;
  const groupedAlertActions = actionsByAlertId(alertActionRows);
  const contributionByMember = new Map<string, bigint>();
  const withdrawalByMember = new Map<string, bigint>();
  for (const row of contributionRows) {
    contributionByMember.set(row.memberId, (contributionByMember.get(row.memberId) ?? BigInt(0)) + moneyUnits4(String(row.amount)));
  }
  for (const row of withdrawalRows) {
    withdrawalByMember.set(row.memberId, (withdrawalByMember.get(row.memberId) ?? BigInt(0)) + moneyUnits4(String(row.amount)));
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
      ...expenseRows.map((row) => ({
        kind: "expense",
        datedOn: row.incurredOn,
        memberId: row.beneficiaryMemberId,
        amount: money4FromUnits(signedExpenseAmountUnits(row)),
        note: row.purpose,
      })),
      ...disbursementRows.map((row) => ({ kind: "loan_disbursement", datedOn: row.disbursedOn, memberId: null, amount: money4(String(row.amount)), note: row.loanId })),
      ...transferRows.map((row) => ({ kind: "transfer", datedOn: row.datedOn, memberId: null, amount: money4(String(row.amount)), note: row.purpose })),
    ].sort((a, b) => `${a.datedOn}-${a.kind}-${a.amount}`.localeCompare(`${b.datedOn}-${b.kind}-${b.amount}`)),
    memberBalances: memberRows.map((row) => ({
      memberId: row.id,
      displayName: row.displayName,
      status: row.status,
      monthNet: money4FromUnits((contributionByMember.get(row.id) ?? BigInt(0)) - (withdrawalByMember.get(row.id) ?? BigInt(0))),
      closingSavingsEstimate: money4FromUnits(moneyUnits4(String(row.initialSavingsBalance)) + (contributionByMember.get(row.id) ?? BigInt(0)) - (withdrawalByMember.get(row.id) ?? BigInt(0))),
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
          nextDueAmount: nextDue ? money4FromUnits(moneyUnits4(String(nextDue.principalDue)) + moneyUnits4(String(nextDue.interestDue))) : null,
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
    movementSummary: {
      bankFees: money4FromUnits(sumSignedExpenseUnits(expenseRows.filter((row) => row.category === "bank_fee"))),
      supplies: money4FromUnits(sumSignedExpenseUnits(expenseRows.filter((row) => row.category === "supplies"))),
      sharedExpenses: money4FromUnits(sumSignedExpenseUnits(expenseRows.filter((row) => row.category === "shared_expense"))),
      operatingExpenses: money4FromUnits(sumSignedExpenseUnits(expenseRows.filter((row) => row.category === "operating"))),
      transfers: money4FromUnits(sumAmountUnits(transferRows.map((row) => ({ amount: String(row.amount) })))),
      netFundBalance: "0.0000",
      pendingRegularizations: 0,
      pendingAssertion: "cero movimientos pendientes de regularizar",
    },
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
  artifactStatus?: "pending" | "failed" | "ready" | null;
  closeAllowed?: boolean;
  pendingRegularizations?: PendingRegularization[];
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
    closeAllowed: classification.closeAllowed && Boolean(input.closeAllowed),
    resolutionKind: input.reconciliation.resolutionKind,
    resolutionNote: input.reconciliation.resolutionNote,
    periodCloseId: input.periodCloseId ?? input.reconciliation.periodCloseId,
    monthlyCloseStatementId: input.statement?.id ?? null,
    monthlyClosePdfUri: input.statement?.pdfUri ?? null,
    canonicalPayloadHash: input.statement?.canonicalPayloadHash ?? null,
    monthlyCloseArtifactStatus: input.artifactStatus ?? (input.statement ? "ready" : null),
    pendingRegularizations: input.pendingRegularizations ?? [],
  };
}

function emptySnapshot(input: {
  orgId: string;
  cycle: typeof contributionCycle.$inferSelect;
  computedPoolBalance: string;
  toleranceAmount: string;
  closeAllowed: boolean;
  pendingRegularizations?: PendingRegularization[];
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
    closeAllowed: classification.closeAllowed && input.closeAllowed,
    resolutionKind: "auto_within_tolerance",
    resolutionNote: null,
    periodCloseId: null,
    monthlyCloseStatementId: null,
    monthlyClosePdfUri: null,
    canonicalPayloadHash: null,
    monthlyCloseArtifactStatus: null,
    pendingRegularizations: input.pendingRegularizations ?? [],
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
  movementSummary?: Record<string, string | number>;
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
    movementSummary: input.movementSummary ?? {},
  };
}

function archivedMonthlyCloseArtifactInput(
  archive: typeof statementArchive.$inferSelect,
): MonthlyCloseArtifactInput {
  if (!archive.canonicalPayload || typeof archive.canonicalPayload !== "object") {
    throw new Error("monthly_close_canonical_payload_missing");
  }
  if (sha256Hex(canonicalJson(archive.canonicalPayload as any)) !== archive.canonicalPayloadHash) {
    throw new Error("monthly_close_canonical_payload_hash_mismatch");
  }
  return {
    orgId: archive.orgId,
    periodLabel: archive.periodLabel,
    canonicalPayloadHash: archive.canonicalPayloadHash,
    payload: archive.canonicalPayload as ReturnType<typeof monthlyClosePayload>,
  };
}

async function latestArtifactEvent(tx: { select(): any }, orgId: string, statementArchiveId: string) {
  const [event] = await tx.select().from(statementArtifactEvent)
    .where(and(
      eq(statementArtifactEvent.orgId, orgId),
      eq(statementArtifactEvent.statementArchiveId, statementArchiveId),
    ))
    .orderBy(
      desc(statementArtifactEvent.createdAt),
      desc(statementArtifactEvent.attemptNumber),
      sql`CASE ${statementArtifactEvent.status} WHEN 'ready' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC`,
    )
    .limit(1);
  return event as typeof statementArtifactEvent.$inferSelect | undefined;
}

const ARTIFACT_PENDING_LEASE_MS = 30_000;

async function reserveArtifactRetry(input: {
  tx: { select(): any; insert(table: typeof statementArtifactEvent): any };
  archive: typeof statementArchive.$inferSelect;
  at: Date;
  force?: boolean;
}): Promise<{ status: "pending" | "failed" | "ready"; task: PendingMonthlyCloseArtifact | null }> {
  const latest = await latestArtifactEvent(input.tx, input.archive.orgId, input.archive.id);
  if (latest?.status === "ready") return { status: "ready", task: null };
  if (!latest && Number(input.archive.byteSize) > 0) return { status: "ready", task: null };
  const pendingIsFresh = latest?.status === "pending"
    && input.at.getTime() - dateValue(latest.attemptedAt).getTime() < ARTIFACT_PENDING_LEASE_MS;
  if (pendingIsFresh && !input.force) return { status: "pending", task: null };

  const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
  await input.tx.insert(statementArtifactEvent).values({
    orgId: input.archive.orgId,
    statementArchiveId: input.archive.id,
    status: "pending",
    attemptNumber,
    byteSize: null,
    errorCode: null,
    attemptedAt: input.at,
    createdAt: input.at,
  });
  return {
    status: "pending",
    task: {
      ...archivedMonthlyCloseArtifactInput(input.archive),
      statementArchiveId: input.archive.id,
      attemptNumber,
    },
  };
}

async function appendArtifactResult(input: {
  task: PendingMonthlyCloseArtifact;
  at: Date;
  result?: MonthlyCloseArtifactResult;
  error?: unknown;
}) {
  await withSystemTenantTransaction(input.task.orgId, {
    operation: "monthly_close_artifact_maintenance",
    reason: "record monthly close artifact result",
  }, async (tx) => {
    const latest = await latestArtifactEvent(tx, input.task.orgId, input.task.statementArchiveId);
    if (latest?.status === "ready") return;
    await tx.insert(statementArtifactEvent).values({
      orgId: input.task.orgId,
      statementArchiveId: input.task.statementArchiveId,
      status: input.result ? "ready" : "failed",
      attemptNumber: input.task.attemptNumber,
      byteSize: input.result?.byteSize ?? null,
      errorCode: input.result ? null : String(input.error instanceof Error ? input.error.message : input.error ?? "artifact_write_failed").slice(0, 200),
      attemptedAt: input.at,
      createdAt: input.at,
    }).onConflictDoNothing();
  });
}

export type CloseArtifactRepairSummary = {
  scannedOrganizations: number;
  attempted: number;
  ready: number;
  failed: number;
};

export async function repairPendingMonthlyCloseArtifacts(input: {
  writer: MonthlyCloseArtifactWriter;
  now?: () => Date;
  organizationIds?: string[];
}): Promise<CloseArtifactRepairSummary> {
  const at = (input.now ?? (() => new Date()))();
  const organizations = input.organizationIds
    ? await db.select({ id: organization.id }).from(organization).where(inArray(organization.id, input.organizationIds))
    : await db.select({ id: organization.id }).from(organization);
  const tasks: PendingMonthlyCloseArtifact[] = [];
  let failed = 0;

  for (const row of organizations) {
    try {
      const reserved = await withSystemTenantTransaction(row.id, {
        operation: "monthly_close_artifact_maintenance",
        reason: "reserve pending monthly close artifact repair",
      }, async (tx) => {
        const archives = await tx.select().from(statementArchive).where(and(
          eq(statementArchive.orgId, row.id),
          eq(statementArchive.kind, "monthly_close"),
        ));
        const orgTasks: PendingMonthlyCloseArtifact[] = [];
        for (const archive of archives) {
          const recovery = await reserveArtifactRetry({ tx, archive, at });
          if (recovery.task) orgTasks.push(recovery.task);
        }
        return orgTasks;
      });
      tasks.push(...reserved);
    } catch {
      failed += 1;
    }
  }

  let ready = 0;
  for (const task of tasks) {
    try {
      const result = await input.writer(task);
      if (result.pdfUri !== `/statement-archive/public/${task.canonicalPayloadHash}.pdf`) {
        throw new Error("monthly_close_artifact_uri_mismatch");
      }
      await appendArtifactResult({ task, at: (input.now ?? (() => new Date()))(), result });
      ready += 1;
    } catch (error) {
      try {
        await appendArtifactResult({ task, at: (input.now ?? (() => new Date()))(), error });
      } catch {
        // Keep later tenants repairable even when this artifact lifecycle cannot persist a terminal event.
      }
      failed += 1;
    }
  }
  return {
    scannedOrganizations: organizations.length,
    attempted: tasks.length,
    ready,
    failed,
  };
}

export function monthlyCloseShareUrl(pdfUri: string): string {
  const publicUri = /^https?:\/\//i.test(pdfUri)
    ? pdfUri
    : `${(process.env.APP_BASE_URL ?? "https://mi-banquito.vercel.app").replace(/\/$/, "")}${pdfUri.startsWith("/") ? pdfUri : `/${pdfUri}`}`;
  return `https://wa.me/?text=${encodeURIComponent(`Revisa el cierre del mes: ${publicUri}`)}`;
}

async function latestClosedMonthlyCloseSnapshot(
  tx: { select(): any },
  orgId: string,
): Promise<ReconciliationSnapshot | null> {
  const [reconciliation] = await tx.select().from(reconciliationCycle)
    .where(and(
      eq(reconciliationCycle.orgId, orgId),
      isNotNull(reconciliationCycle.periodCloseId),
    ))
    .orderBy(desc(reconciliationCycle.closedAt))
    .limit(1);
  if (!reconciliation?.periodCloseId) {
    return null;
  }

  const [cycle] = await tx.select().from(contributionCycle)
    .where(and(eq(contributionCycle.orgId, orgId), eq(contributionCycle.id, reconciliation.cycleId)))
    .limit(1);
  if (!cycle) {
    throw new Error("contribution_cycle_not_found");
  }

  const [closeRow] = await tx.select().from(periodClose)
    .where(and(eq(periodClose.orgId, orgId), eq(periodClose.id, reconciliation.periodCloseId)))
    .limit(1);
  if (!closeRow) {
    throw new Error("period_close_not_found");
  }

  const [archive] = await tx.select().from(statementArchive)
    .where(and(
      eq(statementArchive.orgId, orgId),
      eq(statementArchive.periodCloseId, closeRow.id),
      eq(statementArchive.kind, "monthly_close"),
    ))
    .limit(1);
  const artifactEvent = archive ? await latestArtifactEvent(tx, orgId, archive.id) : undefined;

  return snapshotFromRows({
    orgId,
    cycle,
    reconciliation,
    periodCloseId: closeRow.id,
    statement: archive ?? null,
    artifactStatus: artifactEvent?.status ?? (archive?.byteSize === 0 ? "pending" : archive ? "ready" : null),
    closeAllowed: false,
  });
}

export const createReconciliationService = (options: ReconciliationServiceOptions = {}): ReconciliationService => {
  const auditWriter = options.auditWriter ?? defaultAuditWriter;
  const monthlyCloseArtifactWriter = options.monthlyCloseArtifactWriter;
  const now = options.now ?? (() => new Date());

  return {
    context: "reconciliation",
    async getMonthlyCloseState(orgId) {
      return withTenantTransaction(orgId, async (tx) => {
        const today = dateKeyInEcuador(now());
        let [cycle] = await tx.select().from(contributionCycle)
          .where(and(
            eq(contributionCycle.orgId, orgId),
            eq(contributionCycle.status, "open"),
            lt(contributionCycle.opensOn, contributionCycle.closesOn),
            lt(contributionCycle.closesOn, today),
          ))
          .orderBy(desc(contributionCycle.closesOn))
          .limit(1);
        if (!cycle) {
          const closedSnapshot = await latestClosedMonthlyCloseSnapshot(tx, orgId);
          if (closedSnapshot) {
            return closedSnapshot;
          }

          [cycle] = await tx.select().from(contributionCycle)
            .where(and(eq(contributionCycle.orgId, orgId), eq(contributionCycle.status, "open")))
            .orderBy(desc(contributionCycle.opensOn))
            .limit(1);
        }
        if (!cycle) {
          throw new Error("contribution_cycle_not_found");
        }
        const closeAllowedForCycle = isPastContributionCycle(cycle, now());

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
        const pendingRegularizations = await pendingRegularizationsForCycle(tx as any, {
          orgId,
          opensOn: String(cycle.opensOn),
          closesOn: String(cycle.closesOn),
        });

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
            closeAllowed: false,
            pendingRegularizations,
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
        const artifactEvent = archive ? await latestArtifactEvent(tx, orgId, archive.id) : undefined;

        const freshClassification = classifyReconciliation({
          declaredBankBalance: String(reconciliation.declaredBankBalance),
          computedPoolBalance,
          toleranceAmount: String(reconciliation.toleranceAmount),
          resolutionKind: reconciliation.resolutionKind,
          periodCloseId: closeRow?.id ?? reconciliation.periodCloseId,
        });
        const freshReconciliation = {
          ...reconciliation,
          computedPoolBalance,
          discrepancyAmount: freshClassification.discrepancyAmount,
        };

        return snapshotFromRows({
          orgId,
          cycle,
          reconciliation: freshReconciliation,
          periodCloseId: closeRow?.id ?? reconciliation.periodCloseId,
          statement: archive ?? null,
          artifactStatus: artifactEvent?.status ?? (archive?.byteSize === 0 ? "pending" : archive ? "ready" : null),
          closeAllowed: closeAllowedForCycle && canCloseWithPendingRegularizations(pendingRegularizations),
          pendingRegularizations,
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
            const closeAllowedForCycle = isPastContributionCycle(cycle, writtenAt);
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
              closeAllowed: closeAllowedForCycle,
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
              closeAllowed: isPastContributionCycle(cycle, writtenAt),
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
      let pendingArtifact: PendingMonthlyCloseArtifact | null = null;
      const outcome: ReconciliationSnapshot | { rejection: string } = await withWritableTenantTransaction(input.orgId, async (tx) => {
        const closedAt = now();
        let auditEntry: AdjustmentAuditEntry | undefined;
        let replayed = false;

        await lockTenantMoneyWrites(tx, input.orgId);

        return writeWithAudit({
          write: async () => {
            const [reconciliation] = await tx.select().from(reconciliationCycle)
              .where(and(
                eq(reconciliationCycle.orgId, input.orgId),
                eq(reconciliationCycle.id, input.reconciliationCycleId),
              ))
              .for("update")
              .limit(1);
            if (!reconciliation) {
              throw new Error("reconciliation_cycle_not_found");
            }

            const [cycle] = await tx.select().from(contributionCycle)
              .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.id, reconciliation.cycleId)))
              .for("update")
              .limit(1);
            if (!cycle) {
              throw new Error("contribution_cycle_not_found");
            }
            if (!isPastContributionCycle(cycle, closedAt)) {
              throw new Error("contribution_cycle_not_past");
            }
            const pendingRegularizations = await pendingRegularizationsForCycle(tx, {
              orgId: input.orgId,
              opensOn: String(cycle.opensOn),
              closesOn: String(cycle.closesOn),
            });
            if (!canCloseWithPendingRegularizations(pendingRegularizations)) {
              replayed = true;
              await auditWriter({
                tx,
                entry: {
                  orgId: input.orgId,
                  actorKind: "member",
                  actorId: input.actorId,
                  actionKind: "period_close.reject",
                  subjectKind: "reconciliation_cycle",
                  subjectId: reconciliation.id,
                  payloadSnapshot: {
                    reason: "period_close_pending_regularizations",
                    pendingIds: pendingRegularizations.map((row) => row.id),
                    pending: pendingRegularizations.map((row) => ({ id: row.id, kind: row.kind })),
                  },
                  reason: "period_close_pending_regularizations",
                  at: closedAt,
                  createdAt: closedAt,
                },
              });
              return { rejection: "period_close_pending_regularizations" };
            }

            const freshComputedPoolBalance = await deriveCyclePoolBalance(tx, { orgId: input.orgId, cycle });
            const classification = classifyReconciliation({
              declaredBankBalance: String(reconciliation.declaredBankBalance),
              computedPoolBalance: freshComputedPoolBalance,
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

            const [replayedArchive] = reconciliation.periodCloseId
              ? await tx.select().from(statementArchive)
                .where(and(
                  eq(statementArchive.orgId, input.orgId),
                  eq(statementArchive.periodCloseId, closeRow.id),
                  eq(statementArchive.kind, "monthly_close"),
                ))
                .limit(1)
              : [];
            if (reconciliation.periodCloseId && replayedArchive) {
              replayed = true;
              const recovery = await reserveArtifactRetry({
                tx,
                archive: replayedArchive,
                at: closedAt,
              });
              pendingArtifact = recovery.task;
              return snapshotFromRows({
                orgId: input.orgId,
                cycle,
                reconciliation,
                periodCloseId: closeRow.id,
                statement: replayedArchive,
                artifactStatus: recovery.status,
                closeAllowed: false,
              });
            }

            const [closedReconciliation] = reconciliation.periodCloseId
              ? [reconciliation]
              : await tx.update(reconciliationCycle).set({
                computedPoolBalance: freshComputedPoolBalance,
                discrepancyAmount: classification.discrepancyAmount,
                closedAt: closeRow.closedAt,
                periodCloseId: closeRow.id,
              }).where(eq(reconciliationCycle.id, reconciliation.id)).returning();
            if (cycle.status !== "closed") {
              await tx.update(contributionCycle).set({
                status: "closed",
              }).where(eq(contributionCycle.id, cycle.id)).returning();
            }

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
              movementSummary: {
                ...evidence.movementSummary,
                netFundBalance: money4(String(closedReconciliation.computedPoolBalance)),
                pendingRegularizations: pendingRegularizations.length,
                pendingAssertion: "cero movimientos pendientes de regularizar",
              },
            });
            const hash = sha256Hex(canonicalJson(payload));
            const artifactInput = {
              orgId: input.orgId,
              periodLabel: cycleLabelOf(cycle),
              canonicalPayloadHash: hash,
              payload,
            };
            const artifact = {
              pdfUri: `/statement-archive/public/${hash}.pdf`,
              byteSize: 0,
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
                canonicalPayload: payload,
                generatedAt: closedAt,
                periodCloseId: closeRow.id,
                yearEndShareOutId: null,
                byteSize: artifact.byteSize,
                createdAt: closedAt,
                createdByKind: "system",
              }).onConflictDoNothing().returning();
              archiveRow = insertedArchive;
              if (insertedArchive) {
                await tx.insert(statementArtifactEvent).values({
                  orgId: input.orgId,
                  statementArchiveId: insertedArchive.id,
                  status: "pending",
                  attemptNumber: 1,
                  byteSize: null,
                  errorCode: null,
                  attemptedAt: closedAt,
                  createdAt: closedAt,
                });
                pendingArtifact = {
                  ...artifactInput,
                  statementArchiveId: insertedArchive.id,
                  attemptNumber: 1,
                };
              }
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
              artifactStatus: "pending",
              closeAllowed: false,
            });
          },
          audit: async () => {
            if (replayed) return;
            if (!auditEntry) {
              throw new Error("period close audit entry is missing");
            }
            await auditWriter({ tx, entry: auditEntry });
          },
        });
      });
      if ("rejection" in outcome) {
        throw new Error(outcome.rejection);
      }
      if (pendingArtifact && monthlyCloseArtifactWriter) {
        try {
          const written = await monthlyCloseArtifactWriter(pendingArtifact);
          if (written.pdfUri !== outcome.monthlyClosePdfUri) {
            throw new Error("monthly_close_artifact_uri_mismatch");
          }
          await appendArtifactResult({ task: pendingArtifact, at: now(), result: written });
          return { ...outcome, monthlyCloseArtifactStatus: "ready" };
        } catch (error) {
          await appendArtifactResult({ task: pendingArtifact, at: now(), error });
          return { ...outcome, monthlyCloseArtifactStatus: "failed" };
        }
      }
      return outcome;
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
        const artifactEvent = await latestArtifactEvent(tx, input.orgId, archive.id);
        if (artifactEvent?.status !== "ready" && archive.byteSize === 0) {
          throw new Error("monthly_close_artifact_processing");
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
