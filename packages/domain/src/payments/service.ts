import { createHash, randomUUID } from "node:crypto";
import type { MemberPaymentForm } from "@mi-banquito/contracts";
import { db } from "@mi-banquito/db";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  arAging,
  account,
  auditLogEntry,
  contribution,
  contributionCycle,
  groupConfig,
  loan,
  loanFee,
  loanSchedule,
  paymentAllocation,
  paymentReceipt,
  repayment,
} from "@mi-banquito/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  allocateMemberPayment,
  type ContributionPaymentObligation,
  type LoanPaymentObligation,
  type PaymentAllocationKind,
  type PaymentAllocationLine,
} from "./allocation";

export type RecordMemberPaymentInput = MemberPaymentForm & {
  orgId: string;
  actorId: string;
};

export type RecordMemberPaymentResult = {
  receiptId: string;
  allocations: PaymentAllocationLine[];
  unappliedAmount: string;
  requiresExtraDecision: boolean;
};

export interface PaymentService {
  readonly context: "payment";
  previewMemberPayment(input: RecordMemberPaymentInput): Promise<RecordMemberPaymentResult>;
  recordMemberPayment(input: RecordMemberPaymentInput): Promise<RecordMemberPaymentResult>;
}

type Row = Record<string, unknown>;
type PaymentQuery = Pick<typeof db, "execute" | "insert" | "select" | "update">;
type LoanScheduleStatus = "pendiente" | "parcial" | "pagado" | "atrasado" | "en_mora";

type ChildLinks = {
  repayments: Map<string, string>;
  contributions: Map<string, string>;
};

export type CanonicalReceiptCommand = {
  orgId: string;
  actorId: string;
  accountId: string;
  memberId: string;
  amount: string;
  datedOn: string;
  receivedVia: string;
  slipPhotoId: string | null;
  notes: string | null;
  extraDecision: string | null;
  targetLoanId: string | null;
  targetCycleId: string | null;
  overrideReason: string | null;
};

export type LegacyReceiptCommand = {
  kind: "legacy_payment_command_v1";
  legacy: true;
  known: Partial<CanonicalReceiptCommand>;
  unknownFields: Array<keyof CanonicalReceiptCommand>;
};

function isLegacyReceiptCommand(value: CanonicalReceiptCommand | LegacyReceiptCommand): value is LegacyReceiptCommand {
  return "kind" in value && value.kind === "legacy_payment_command_v1";
}

export function assertCanonicalReceiptReplay(
  expected: CanonicalReceiptCommand,
  actual: CanonicalReceiptCommand | LegacyReceiptCommand,
): void {
  const comparable = (command: CanonicalReceiptCommand) => ({
    orgId: command.orgId,
    actorId: command.actorId,
    accountId: command.accountId,
    memberId: command.memberId,
    amount: command.amount,
    datedOn: command.datedOn,
    receivedVia: command.receivedVia,
    slipPhotoId: command.slipPhotoId,
    notes: normalizeNullableText(command.notes),
    extraDecision: command.extraDecision,
    targetLoanId: command.targetLoanId,
    targetCycleId: command.targetCycleId,
    overrideReason: normalizeNullableText(command.overrideReason),
  });
  const expectedValue = comparable(expected);
  if (isLegacyReceiptCommand(actual)) {
    if (actual.legacy !== true || !actual.known || typeof actual.known !== "object" || Array.isArray(actual.known)
      || !Array.isArray(actual.unknownFields)) {
      throw new Error("payment_idempotency_conflict");
    }
    const known = actual.known as Record<string, unknown>;
    const canonicalFields = Object.keys(expectedValue);
    const unknownFields = new Set<string>(actual.unknownFields);
    if (unknownFields.size !== actual.unknownFields.length
      || [...unknownFields].some((field) => !canonicalFields.includes(field))
      || canonicalFields.some((field) => Object.hasOwn(known, field) === unknownFields.has(field))) {
      throw new Error("payment_idempotency_conflict");
    }
    const normalizedKnown = {
      ...known,
      ...(Object.hasOwn(known, "amount") ? { amount: money4(known.amount as string | number) } : {}),
      ...(Object.hasOwn(known, "notes") ? { notes: normalizeNullableText(known.notes as string | null | undefined) } : {}),
      ...(Object.hasOwn(known, "overrideReason") ? { overrideReason: normalizeNullableText(known.overrideReason as string | null | undefined) } : {}),
    };
    for (const [field, value] of Object.entries(normalizedKnown)) {
      if (!(field in expectedValue) || JSON.stringify(expectedValue[field as keyof typeof expectedValue]) !== JSON.stringify(value)) {
        throw new Error("payment_idempotency_conflict");
      }
    }
    return;
  }
  const actualValue = comparable(actual);
  if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
    throw new Error("payment_idempotency_conflict");
  }
}

async function depositAccountForWrite(query: PaymentQuery, input: RecordMemberPaymentInput) {
  const [groupFundAccount] = await query.select({ id: account.id }).from(account).where(and(
    eq(account.orgId, input.orgId),
    eq(account.status, "active"),
    eq(account.isGroupFund, true),
  )).limit(1);
  if (!groupFundAccount) throw new Error("deposit_group_account_required");

  const [selected] = await query.select().from(account).where(and(
    eq(account.orgId, input.orgId),
    eq(account.id, input.accountId),
    eq(account.status, "active"),
  )).for("update").limit(1);
  if (!selected) throw new Error("deposit_account_unavailable");
  return {
    accountId: selected.id,
    reconciliationStatus: selected.isGroupFund ? "regularized" as const : "pending" as const,
  };
}

const ACTOR_KIND = "member";
const ACTIVE_LOAN_STATUSES = new Set(["originated", "activo", "en_mora"]);

const money4 = (value: string | number | null | undefined): string => Number(value ?? 0).toFixed(4);

const positiveMoney4 = (value: number): string => money4(Math.max(0, value));

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const deterministicUuid = (seed: string): string => {
  const hex = createHash("sha256").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join("-");
};

const readModelRefreshSql = sql`SELECT refresh_sprint1_read_models()`;

function isLoanRowOpen(row: Row, memberId: string): boolean {
  return ACTIVE_LOAN_STATUSES.has(String(row.status)) && String(row.borrowerMemberId ?? row.memberId) === memberId;
}

function loanObligationsForRows(input: {
  memberId: string;
  datedOn: string;
  principalPrepaymentLoanId: string | null;
  loans: Row[];
  schedules: Row[];
  fees: Row[];
  repayments: Row[];
}): LoanPaymentObligation[] {
  return input.loans
    .filter((loanRow) => isLoanRowOpen(loanRow, input.memberId))
    .flatMap((loanRow) => {
      const loanId = String(loanRow.id);
      const paidForLoan = input.repayments.filter((row) => String(row.loanId) === loanId);
      const paidPrincipalForLoan = paidForLoan.reduce((total, row) => total + Number(row.appliedToPrincipal ?? 0), 0);
      const dueScheduleRows = input.schedules
        .filter((row) => String(row.loanId) === loanId && String(row.dueOn) <= input.datedOn)
        .sort((a, b) => String(a.dueOn).localeCompare(String(b.dueOn)) || String(a.id).localeCompare(String(b.id)));
      const unpaidPrincipalDue = dueScheduleRows.reduce(
        (total, scheduleRow) => total + Math.max(0, Number(scheduleRow.principalDue ?? 0) - Number(scheduleRow.paidPrincipalToDate ?? 0)),
        0,
      );
      let remainingPrepayablePrincipal = Math.max(
        0,
        Number(loanRow.principalAmount ?? 0) - paidPrincipalForLoan - unpaidPrincipalDue,
      );
      const allowsPrincipalPrepayment = input.principalPrepaymentLoanId === loanId;
      let remainingFeePaid = paidForLoan.reduce((total, row) => total + Number(row.appliedToFee ?? 0), 0);

      return dueScheduleRows
        .map((scheduleRow) => {
          const scheduleId = String(scheduleRow.id);
          const feeRows = input.fees.filter((row) => (
            String(row.loanId) === loanId
            && (String(row.loanScheduleId ?? "") === scheduleId || (!row.loanScheduleId && String(row.datedOn) === String(scheduleRow.dueOn)))
          ));
          const scheduleFee = feeRows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
          const feePaid = Math.min(scheduleFee, remainingFeePaid);
          remainingFeePaid -= feePaid;
          const prepayablePrincipal = allowsPrincipalPrepayment ? remainingPrepayablePrincipal : 0;
          remainingPrepayablePrincipal = 0;

          return {
            loanId,
            loanScheduleId: scheduleId,
            loanFeeId: feeRows[0]?.id ? String(feeRows[0].id) : null,
            dueOn: String(scheduleRow.dueOn),
            feeDue: positiveMoney4(scheduleFee - feePaid),
            interestDue: positiveMoney4(Number(scheduleRow.interestDue ?? 0) - Number(scheduleRow.paidInterestToDate ?? 0)),
            principalDue: positiveMoney4(Number(scheduleRow.principalDue ?? 0) - Number(scheduleRow.paidPrincipalToDate ?? 0)),
            prepayablePrincipal: positiveMoney4(prepayablePrincipal),
          };
        });
    })
    .filter((obligation) => (
      Number(obligation.feeDue) > 0
      || Number(obligation.interestDue) > 0
      || Number(obligation.principalDue) > 0
      || Number(obligation.prepayablePrincipal ?? 0) > 0
    ));
}

function contributionKindForAging(row: Row, datedOn: string): ContributionPaymentObligation["kind"] {
  const reason = String(row.reasonKind ?? "");
  if (reason.includes("future")) {
    return "future";
  }
  if (reason.includes("current") || String(row.dueDate ?? "") >= datedOn) {
    return "current";
  }
  return "overdue";
}

function contributionObligationsForRows(input: {
  memberId: string;
  datedOn: string;
  agingRows: Row[];
  cycleRows: Row[];
}): ContributionPaymentObligation[] {
  const byCycleId = new Map<string, ContributionPaymentObligation>();

  for (const row of input.agingRows) {
    if (String(row.memberId ?? "") !== input.memberId || !row.cycleId || Number(row.amountDue ?? 0) <= 0) {
      continue;
    }
    byCycleId.set(String(row.cycleId), {
      cycleId: String(row.cycleId),
      cycleLabel: String(row.periodLabel ?? row.cycleLabel ?? row.cycleId),
      dueOn: String(row.dueDate ?? row.closesOn ?? input.datedOn),
      amountDue: money4(row.amountDue as string | number),
      kind: contributionKindForAging(row, input.datedOn),
    });
  }

  for (const row of input.cycleRows) {
    if (!row.id || byCycleId.has(String(row.id))) {
      continue;
    }
    const closesOn = String(row.closesOn ?? input.datedOn);
    const kind: ContributionPaymentObligation["kind"] = closesOn > input.datedOn ? "future" : "current";
    byCycleId.set(String(row.id), {
      cycleId: String(row.id),
      cycleLabel: String(row.cycleLabel ?? row.id),
      dueOn: closesOn,
      amountDue: money4(row.expectedAmountPerMember as string | number),
      kind,
    });
  }

  return [...byCycleId.values()].filter((obligation) => Number(obligation.amountDue) > 0);
}

function allocationLineFromRow(row: Row): PaymentAllocationLine {
  return {
    kind: String(row.allocationKind ?? row.kind) as PaymentAllocationKind,
    amount: money4(row.amount as string | number),
    sortOrder: Number(row.sortOrder),
    currencyCode: String(row.currencyCode),
    brId: "BR-26",
    groupConfigVersion: Number(row.groupConfigVersion),
    ...(row.loanId ? { loanId: String(row.loanId) } : {}),
    ...(row.loanScheduleId ? { loanScheduleId: String(row.loanScheduleId) } : {}),
    ...(row.loanFeeId ? { loanFeeId: String(row.loanFeeId) } : {}),
    ...(row.cycleId ? { cycleId: String(row.cycleId) } : {}),
    ...(row.cycleLabel ? { cycleLabel: String(row.cycleLabel) } : {}),
  };
}

function groupLoanAllocations(lines: PaymentAllocationLine[]): Map<string, PaymentAllocationLine[]> {
  const groups = new Map<string, PaymentAllocationLine[]>();
  for (const line of lines) {
    if (!line.loanId) {
      continue;
    }
    const existing = groups.get(line.loanId) ?? [];
    existing.push(line);
    groups.set(line.loanId, existing);
  }
  return groups;
}

function groupContributionAllocations(lines: PaymentAllocationLine[]): Map<string, PaymentAllocationLine[]> {
  const groups = new Map<string, PaymentAllocationLine[]>();
  for (const line of lines) {
    if (!line.kind.startsWith("contribution_") && line.kind !== "extra_savings") {
      continue;
    }
    const key = line.cycleId ?? "extra_savings";
    const existing = groups.get(key) ?? [];
    existing.push(line);
    groups.set(key, existing);
  }
  return groups;
}

function sumLines(lines: PaymentAllocationLine[], kind?: PaymentAllocationKind): string {
  return money4(lines
    .filter((line) => !kind || line.kind === kind)
    .reduce((total, line) => total + Number(line.amount), 0));
}

function principalPrepaymentLoanIdForInput(input: RecordMemberPaymentInput): string | null {
  if (input.extraDecision !== "loan_principal") {
    return null;
  }

  const targetLoanId = normalizeNullableText(input.targetLoanId);
  if (!targetLoanId) {
    throw new Error("payment_target_loan_required_for_principal_prepayment");
  }

  return targetLoanId;
}

function contributionCycleForGroup(key: string, lines: PaymentAllocationLine[], input: RecordMemberPaymentInput): string {
  const lineCycleId = lines.find((line) => line.cycleId)?.cycleId;
  if (lineCycleId) {
    return lineCycleId;
  }
  if (input.targetCycleId) {
    return input.targetCycleId;
  }
  throw new Error(`payment_contribution_cycle_required:${key}`);
}

async function allocationContextForInput(query: PaymentQuery, input: RecordMemberPaymentInput): Promise<{
  allocations: PaymentAllocationLine[];
  contributionObligations: ContributionPaymentObligation[];
  currencyCode: string;
  groupConfigVersion: number;
  requiresExtraDecision: boolean;
  scheduleRows: Row[];
  unappliedAmount: string;
}> {
  const [currentConfig] = await query.select().from(groupConfig)
    .where(and(eq(groupConfig.orgId, input.orgId), isNull(groupConfig.validTo)))
    .orderBy(desc(groupConfig.version));
  if (!currentConfig) {
    throw new Error("group_config_not_found");
  }

  const loanRows = await query.select().from(loan)
    .where(and(eq(loan.orgId, input.orgId), eq(loan.borrowerMemberId, input.memberId)));
  const scheduleRows = await query.select().from(loanSchedule)
    .where(eq(loanSchedule.orgId, input.orgId));
  const feeRows = await query.select().from(loanFee)
    .where(eq(loanFee.orgId, input.orgId));
  const repaymentRows = await query.select().from(repayment)
    .where(and(eq(repayment.orgId, input.orgId), eq(repayment.memberId, input.memberId)));
  const agingRows = await query.select().from(arAging)
    .where(and(eq(arAging.orgId, input.orgId), eq(arAging.memberId, input.memberId)));
  const cycleRows = await query.select().from(contributionCycle)
    .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.status, "open")));

  const contributionObligations = contributionObligationsForRows({
    memberId: input.memberId,
    datedOn: input.datedOn,
    agingRows: agingRows as Row[],
    cycleRows: cycleRows as Row[],
  });
  const principalPrepaymentLoanId = principalPrepaymentLoanIdForInput(input);
  const allocation = allocateMemberPayment({
    orgId: input.orgId,
    memberId: input.memberId,
    amount: money4(input.amount),
    currencyCode: String(currentConfig.currencyCode ?? "USD"),
    datedOn: input.datedOn,
    groupConfigVersion: Number(currentConfig.version),
    loanObligations: loanObligationsForRows({
      memberId: input.memberId,
      datedOn: input.datedOn,
      principalPrepaymentLoanId,
      loans: loanRows as Row[],
      schedules: scheduleRows as Row[],
      fees: feeRows as Row[],
      repayments: repaymentRows as Row[],
    }),
    contributionObligations,
    extraDecision: input.extraDecision || null,
  });

  return {
    allocations: allocation.lines,
    contributionObligations,
    currencyCode: allocation.currencyCode,
    groupConfigVersion: allocation.groupConfigVersion,
    requiresExtraDecision: allocation.requiresExtraDecision,
    scheduleRows: scheduleRows as Row[],
    unappliedAmount: allocation.unappliedAmount,
  };
}

async function existingReceiptResult(
  query: PaymentQuery,
  existingReceipt: Row,
  expected: CanonicalReceiptCommand,
): Promise<RecordMemberPaymentResult> {
  const allocationRows = await query.select().from(paymentAllocation)
    .where(and(eq(paymentAllocation.orgId, String(existingReceipt.orgId)), eq(paymentAllocation.receiptId, String(existingReceipt.id))))
    .orderBy(paymentAllocation.sortOrder);

  const allocations = (allocationRows as Row[]).map(allocationLineFromRow);
  const persistedCommand = existingReceipt.commandPayload && typeof existingReceipt.commandPayload === "object"
    ? existingReceipt.commandPayload as CanonicalReceiptCommand
    : {
    orgId: String(existingReceipt.orgId),
    actorId: String(existingReceipt.createdBy),
    accountId: String(existingReceipt.accountId),
    memberId: String(existingReceipt.memberId),
    amount: money4(existingReceipt.amount as string | number),
    datedOn: String(existingReceipt.datedOn),
    receivedVia: String(existingReceipt.receivedVia),
    slipPhotoId: existingReceipt.slipPhotoId ? String(existingReceipt.slipPhotoId) : null,
    notes: normalizeNullableText(existingReceipt.notes as string | null | undefined),
    extraDecision: existingReceipt.extraDecision ? String(existingReceipt.extraDecision) : null,
    targetLoanId: null,
    targetCycleId: null,
    overrideReason: null,
  };
  assertCanonicalReceiptReplay(expected, persistedCommand);
  return {
    receiptId: String(existingReceipt.id),
    allocations,
    unappliedAmount: "0.0000",
    requiresExtraDecision: false,
  };
}

function canonicalReceiptCommand(
  input: RecordMemberPaymentInput,
): CanonicalReceiptCommand {
  return {
    orgId: input.orgId,
    actorId: input.actorId,
    accountId: input.accountId,
    memberId: input.memberId,
    amount: money4(input.amount),
    datedOn: input.datedOn,
    receivedVia: input.paymentSource,
    slipPhotoId: input.slipPhotoId || null,
    notes: normalizeNullableText(input.notes),
    extraDecision: input.extraDecision || null,
    targetLoanId: input.targetLoanId || null,
    targetCycleId: input.targetCycleId || null,
    overrideReason: normalizeNullableText(input.overrideReason),
  };
}

async function findExistingReceipt(query: PaymentQuery, input: RecordMemberPaymentInput): Promise<Row | undefined> {
  const [existingReceipt] = await query.select().from(paymentReceipt)
    .where(and(eq(paymentReceipt.orgId, input.orgId), eq(paymentReceipt.clientRequestId, input.clientRequestId)));
  return existingReceipt as Row | undefined;
}

function currentCycleIdForExtraSavings(input: {
  allocationLines: PaymentAllocationLine[];
  contributionObligations: ContributionPaymentObligation[];
  paymentInput: RecordMemberPaymentInput;
}): string {
  if (input.paymentInput.targetCycleId) {
    return input.paymentInput.targetCycleId;
  }

  const currentAllocationCycle = input.allocationLines.find((line) => line.kind === "contribution_current" && line.cycleId)?.cycleId;
  if (currentAllocationCycle) {
    return currentAllocationCycle;
  }

  const currentObligation = [...input.contributionObligations]
    .filter((obligation) => obligation.kind === "current")
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.cycleId.localeCompare(b.cycleId))[0];
  if (currentObligation) {
    return currentObligation.cycleId;
  }

  throw new Error("payment_contribution_cycle_required:extra_savings");
}

function cycleIdForContributionGroup(input: {
  allocationLines: PaymentAllocationLine[];
  contributionObligations: ContributionPaymentObligation[];
  cycleKey: string;
  lines: PaymentAllocationLine[];
  paymentInput: RecordMemberPaymentInput;
}): string {
  if (input.cycleKey === "extra_savings") {
    return currentCycleIdForExtraSavings({
      allocationLines: input.allocationLines,
      contributionObligations: input.contributionObligations,
      paymentInput: input.paymentInput,
    });
  }

  return contributionCycleForGroup(input.cycleKey, input.lines, input.paymentInput);
}

function contributionLinkKeyForLine(line: PaymentAllocationLine): string | null {
  if (!line.kind.startsWith("contribution_") && line.kind !== "extra_savings") {
    return null;
  }
  return line.kind === "extra_savings" ? "extra_savings" : line.cycleId ?? null;
}

function persistedCycleIdForLine(line: PaymentAllocationLine, extraSavingsCycleId: string | null): string | null {
  if (line.kind === "extra_savings") {
    return extraSavingsCycleId;
  }
  return line.cycleId ?? null;
}

function loanScheduleUpdates(input: {
  allocations: PaymentAllocationLine[];
  scheduleRows: Row[];
}): Array<{ scheduleId: string; values: { paidPrincipalToDate: string; paidInterestToDate: string; status: LoanScheduleStatus } }> {
  const scheduleApplications = new Map<string, { principal: number; interest: number }>();
  for (const line of input.allocations) {
    if (!line.loanScheduleId || (line.kind !== "loan_principal" && line.kind !== "loan_interest")) {
      continue;
    }

    const existing = scheduleApplications.get(line.loanScheduleId) ?? { principal: 0, interest: 0 };
    if (line.kind === "loan_principal") {
      existing.principal += Number(line.amount);
    } else {
      existing.interest += Number(line.amount);
    }
    scheduleApplications.set(line.loanScheduleId, existing);
  }

  return [...scheduleApplications.entries()].flatMap(([scheduleId, applied]) => {
    const scheduleRow = input.scheduleRows.find((row) => String(row.id) === scheduleId);
    if (!scheduleRow) {
      return [];
    }

    const principalDue = Number(scheduleRow.principalDue ?? 0);
    const interestDue = Number(scheduleRow.interestDue ?? 0);
    const paidPrincipalToDate = Math.min(
      principalDue,
      Number(scheduleRow.paidPrincipalToDate ?? 0) + applied.principal,
    );
    const paidInterestToDate = Math.min(
      interestDue,
      Number(scheduleRow.paidInterestToDate ?? 0) + applied.interest,
    );
    const status: LoanScheduleStatus = paidPrincipalToDate >= principalDue && paidInterestToDate >= interestDue
      ? "pagado"
      : paidPrincipalToDate > 0 || paidInterestToDate > 0
        ? "parcial"
        : "pendiente";

    return [{
      scheduleId,
      values: {
        paidPrincipalToDate: money4(paidPrincipalToDate),
        paidInterestToDate: money4(paidInterestToDate),
        status,
      },
    }];
  });
}

async function refreshReadModels(tx: { execute(query: unknown): Promise<unknown> }): Promise<void> {
  await tx.execute(readModelRefreshSql);
}

export function createPaymentService(): PaymentService {
  return {
    context: "payment",
    async previewMemberPayment(input) {
      const allocation = await allocationContextForInput(db, input);

      return {
        receiptId: "",
        allocations: allocation.allocations,
        unappliedAmount: allocation.unappliedAmount,
        requiresExtraDecision: allocation.requiresExtraDecision,
      };
    },
    async recordMemberPayment(input) {
      principalPrepaymentLoanIdForInput(input);

      const existingReceipt = await findExistingReceipt(db, input);
      if (existingReceipt) {
        return existingReceiptResult(db, existingReceipt, canonicalReceiptCommand(input));
      }

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const depositAccount = await depositAccountForWrite(tx, input);
        const allocation = await allocationContextForInput(tx, input);
        if (allocation.requiresExtraDecision) {
          throw new Error("payment_extra_decision_required");
        }
        const canonicalCommand = canonicalReceiptCommand(input);

        const now = new Date();
        const receiptId = deterministicUuid(`payment_receipt:${input.orgId}:${input.memberId}:${input.clientRequestId}`);
        const childLinks: ChildLinks = {
          repayments: new Map(),
          contributions: new Map(),
        };
        const [insertedReceipt] = await tx.insert(paymentReceipt).values({
          id: receiptId,
          orgId: input.orgId,
          memberId: input.memberId,
          accountId: depositAccount.accountId,
          amount: money4(input.amount),
          currencyCode: allocation.currencyCode,
          datedOn: input.datedOn,
          receivedVia: input.paymentSource,
          slipPhotoId: input.slipPhotoId || null,
          notes: normalizeNullableText(input.notes),
          extraDecision: input.extraDecision || null,
          commandPayload: canonicalCommand,
          clientRequestId: input.clientRequestId,
          createdAt: now,
          createdBy: input.actorId,
          createdByKind: ACTOR_KIND,
        }).onConflictDoNothing().returning();
        if (!insertedReceipt) {
          const conflictedReceipt = await findExistingReceipt(tx, input);
          if (!conflictedReceipt) {
            throw new Error("payment_receipt_conflict_without_existing_receipt");
          }

          return existingReceiptResult(tx, conflictedReceipt, canonicalCommand);
        }

        let childOrder = 1;
        for (const [loanId, lines] of groupLoanAllocations(allocation.allocations)) {
          const repaymentId = randomUUID();
          const repaymentAmount = sumLines(lines);
          childLinks.repayments.set(loanId, repaymentId);
          await tx.insert(repayment).values({
            id: repaymentId,
            orgId: input.orgId,
            loanId,
            memberId: input.memberId,
            amount: repaymentAmount,
            currencyCode: lines[0]?.currencyCode ?? "USD",
            appliedToPrincipal: sumLines(lines, "loan_principal"),
            appliedToInterest: sumLines(lines, "loan_interest"),
            appliedToFee: sumLines(lines, "loan_fee"),
            datedOn: input.datedOn,
            recordedAt: now,
            slipPhotoId: input.slipPhotoId || null,
            notes: normalizeNullableText(input.notes),
            reversesId: null,
            reverseReason: null,
            adjustmentCycleId: null,
            clientRequestId: deterministicUuid(`${input.clientRequestId}:repayment:${childOrder}:${loanId}`),
            paymentReceiptId: receiptId,
            accountId: depositAccount.accountId,
            reconciliationStatus: depositAccount.reconciliationStatus,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: ACTOR_KIND,
            actorId: input.actorId,
            actionKind: "loan.repayment.create",
            subjectKind: "repayment",
            subjectId: repaymentId,
            payloadSnapshot: {
              paymentReceiptId: receiptId,
              memberId: input.memberId,
              loanId,
              amount: repaymentAmount,
              datedOn: input.datedOn,
              accountId: depositAccount.accountId,
              reconciliationStatus: depositAccount.reconciliationStatus,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
          childOrder += 1;
        }

        let extraSavingsCycleId: string | null = null;
        for (const [cycleKey, lines] of groupContributionAllocations(allocation.allocations)) {
          const contributionId = randomUUID();
          const contributionAmount = sumLines(lines);
          const cycleId = cycleIdForContributionGroup({
            allocationLines: allocation.allocations,
            contributionObligations: allocation.contributionObligations,
            cycleKey,
            lines,
            paymentInput: input,
          });
          if (cycleKey === "extra_savings") {
            extraSavingsCycleId = cycleId;
          }
          childLinks.contributions.set(cycleKey, contributionId);
          if (cycleKey !== cycleId && !childLinks.contributions.has(cycleId)) {
            childLinks.contributions.set(cycleId, contributionId);
          }
          await tx.insert(contribution).values({
            id: contributionId,
            orgId: input.orgId,
            cycleId,
            memberId: input.memberId,
            kind: "regular",
            paymentSource: input.paymentSource,
            amount: contributionAmount,
            currencyCode: lines[0]?.currencyCode ?? "USD",
            datedOn: input.datedOn,
            recordedAt: now,
            slipPhotoId: input.slipPhotoId || null,
            notes: normalizeNullableText(input.notes),
            reversesId: null,
            reverseReason: null,
            adjustmentCycleId: null,
            clientRequestId: deterministicUuid(`${input.clientRequestId}:contribution:${childOrder}:${cycleKey}`),
            paymentReceiptId: receiptId,
            accountId: depositAccount.accountId,
            reconciliationStatus: depositAccount.reconciliationStatus,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: ACTOR_KIND,
            actorId: input.actorId,
            actionKind: "contribution.create",
            subjectKind: "contribution",
            subjectId: contributionId,
            payloadSnapshot: {
              paymentReceiptId: receiptId,
              memberId: input.memberId,
              cycleId,
              amount: contributionAmount,
              datedOn: input.datedOn,
              accountId: depositAccount.accountId,
              reconciliationStatus: depositAccount.reconciliationStatus,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
          childOrder += 1;
        }

        for (const scheduleUpdate of loanScheduleUpdates({
          allocations: allocation.allocations,
          scheduleRows: allocation.scheduleRows,
        })) {
          await tx.update(loanSchedule).set(scheduleUpdate.values)
            .where(and(eq(loanSchedule.orgId, input.orgId), eq(loanSchedule.id, scheduleUpdate.scheduleId)));
        }

        const persistedAllocations = allocation.allocations.map((line) => {
          const cycleId = persistedCycleIdForLine(line, extraSavingsCycleId);
          const contributionLinkKey = contributionLinkKeyForLine(line);
          return {
            id: randomUUID(),
            orgId: input.orgId,
            receiptId,
            memberId: input.memberId,
            sortOrder: line.sortOrder,
            allocationKind: line.kind,
            amount: line.amount,
            currencyCode: line.currencyCode,
            loanId: line.loanId ?? null,
            loanScheduleId: line.loanScheduleId ?? null,
            loanFeeId: line.loanFeeId ?? null,
            cycleId,
            repaymentId: line.loanId ? childLinks.repayments.get(line.loanId) ?? null : null,
            contributionId: contributionLinkKey
              ? childLinks.contributions.get(contributionLinkKey) ?? null
              : null,
            brId: line.brId,
            groupConfigVersion: line.groupConfigVersion,
            createdAt: now,
          };
        });
        await tx.insert(paymentAllocation).values(persistedAllocations);

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: ACTOR_KIND,
          actorId: input.actorId,
          actionKind: "payment.receipt.recorded",
          subjectKind: "payment_receipt",
          subjectId: receiptId,
          payloadSnapshot: {
            memberId: input.memberId,
            receivedAmount: input.amount,
            datedOn: input.datedOn,
            extraDecision: input.extraDecision || null,
            allocations: persistedAllocations.map((line) => ({
              kind: line.allocationKind,
              amount: line.amount,
              loanId: line.loanId,
              cycleId: line.cycleId,
              cycleLabel: allocation.allocations.find((source) => source.sortOrder === line.sortOrder)?.cycleLabel ?? null,
              repaymentId: line.repaymentId,
              contributionId: line.contributionId,
            })),
            accountId: depositAccount.accountId,
            reconciliationStatus: depositAccount.reconciliationStatus,
          },
          reason: null,
          at: now,
          createdAt: now,
        });

        await refreshReadModels(tx);

        return {
          receiptId,
          allocations: allocation.allocations.map((line) => ({
            ...line,
            cycleId: persistedCycleIdForLine(line, extraSavingsCycleId) ?? undefined,
          })),
          unappliedAmount: allocation.unappliedAmount,
          requiresExtraDecision: allocation.requiresExtraDecision,
        };
      });
    },
  };
}
