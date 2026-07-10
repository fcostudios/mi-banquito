import { createHash, randomUUID } from "node:crypto";
import type { MemberPaymentForm } from "@mi-banquito/contracts";
import { db } from "@mi-banquito/db";
import { withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import {
  arAging,
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

type ChildLinks = {
  repayments: Map<string, string>;
  contributions: Map<string, string>;
};

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
      let remainingFeePaid = paidForLoan.reduce((total, row) => total + Number(row.appliedToFee ?? 0), 0);

      return input.schedules
        .filter((row) => String(row.loanId) === loanId && String(row.dueOn) <= input.datedOn)
        .map((scheduleRow) => {
          const scheduleId = String(scheduleRow.id);
          const feeRows = input.fees.filter((row) => (
            String(row.loanId) === loanId
            && (String(row.loanScheduleId ?? "") === scheduleId || (!row.loanScheduleId && String(row.datedOn) === String(scheduleRow.dueOn)))
          ));
          const scheduleFee = feeRows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
          const feePaid = Math.min(scheduleFee, remainingFeePaid);
          remainingFeePaid -= feePaid;

          return {
            loanId,
            loanScheduleId: scheduleId,
            loanFeeId: feeRows[0]?.id ? String(feeRows[0].id) : null,
            dueOn: String(scheduleRow.dueOn),
            feeDue: positiveMoney4(scheduleFee - feePaid),
            interestDue: positiveMoney4(Number(scheduleRow.interestDue ?? 0) - Number(scheduleRow.paidInterestToDate ?? 0)),
            principalDue: positiveMoney4(Number(scheduleRow.principalDue ?? 0) - Number(scheduleRow.paidPrincipalToDate ?? 0)),
            prepayablePrincipal: positiveMoney4(
              Number(loanRow.principalAmount ?? 0)
                - paidForLoan.reduce((total, row) => total + Number(row.appliedToPrincipal ?? 0), 0),
            ),
          };
        });
    })
    .filter((obligation) => (
      Number(obligation.feeDue) > 0
      || Number(obligation.interestDue) > 0
      || Number(obligation.principalDue) > 0
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

async function refreshReadModels(tx: { execute(query: unknown): Promise<unknown> }): Promise<void> {
  await tx.execute(readModelRefreshSql);
}

export function createPaymentService(): PaymentService {
  return {
    context: "payment",
    async previewMemberPayment(input) {
      const [currentConfig] = await db.select().from(groupConfig)
        .where(and(eq(groupConfig.orgId, input.orgId), isNull(groupConfig.validTo)))
        .orderBy(desc(groupConfig.version));
      if (!currentConfig) {
        throw new Error("group_config_not_found");
      }

      const loanRows = await db.select().from(loan)
        .where(and(eq(loan.orgId, input.orgId), eq(loan.borrowerMemberId, input.memberId)));
      const scheduleRows = await db.select().from(loanSchedule)
        .where(eq(loanSchedule.orgId, input.orgId));
      const feeRows = await db.select().from(loanFee)
        .where(eq(loanFee.orgId, input.orgId));
      const repaymentRows = await db.select().from(repayment)
        .where(and(eq(repayment.orgId, input.orgId), eq(repayment.memberId, input.memberId)));
      const agingRows = await db.select().from(arAging)
        .where(and(eq(arAging.orgId, input.orgId), eq(arAging.memberId, input.memberId)));
      const cycleRows = await db.select().from(contributionCycle)
        .where(and(eq(contributionCycle.orgId, input.orgId), eq(contributionCycle.status, "open")));

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
          loans: loanRows as Row[],
          schedules: scheduleRows as Row[],
          fees: feeRows as Row[],
          repayments: repaymentRows as Row[],
        }),
        contributionObligations: contributionObligationsForRows({
          memberId: input.memberId,
          datedOn: input.datedOn,
          agingRows: agingRows as Row[],
          cycleRows: cycleRows as Row[],
        }),
        extraDecision: input.extraDecision || null,
      });

      return {
        receiptId: "",
        allocations: allocation.lines,
        unappliedAmount: allocation.unappliedAmount,
        requiresExtraDecision: allocation.requiresExtraDecision,
      };
    },
    async recordMemberPayment(input) {
      const [existingReceipt] = await db.select().from(paymentReceipt)
        .where(and(eq(paymentReceipt.orgId, input.orgId), eq(paymentReceipt.clientRequestId, input.clientRequestId)));
      if (existingReceipt) {
        const allocationRows = await db.select().from(paymentAllocation)
          .where(and(eq(paymentAllocation.orgId, input.orgId), eq(paymentAllocation.receiptId, existingReceipt.id)))
          .orderBy(paymentAllocation.sortOrder);
        return {
          receiptId: String(existingReceipt.id),
          allocations: (allocationRows as Row[]).map(allocationLineFromRow),
          unappliedAmount: "0.0000",
          requiresExtraDecision: false,
        };
      }

      const preview = await this.previewMemberPayment(input);
      if (preview.requiresExtraDecision) {
        throw new Error("payment_extra_decision_required");
      }

      const now = new Date();
      const receiptId = randomUUID();
      const childLinks: ChildLinks = {
        repayments: new Map(),
        contributions: new Map(),
      };

      await withWritableTenantTransaction(input.orgId, async (tx) => {
        await tx.insert(paymentReceipt).values({
          id: receiptId,
          orgId: input.orgId,
          memberId: input.memberId,
          amount: money4(input.amount),
          currencyCode: preview.allocations[0]?.currencyCode ?? "USD",
          datedOn: input.datedOn,
          receivedVia: input.paymentSource,
          slipPhotoId: input.slipPhotoId || null,
          notes: normalizeNullableText(input.notes),
          extraDecision: input.extraDecision || null,
          clientRequestId: input.clientRequestId,
          createdAt: now,
          createdBy: input.actorId,
          createdByKind: ACTOR_KIND,
        });

        let childOrder = 1;
        for (const [loanId, lines] of groupLoanAllocations(preview.allocations)) {
          const repaymentId = randomUUID();
          childLinks.repayments.set(loanId, repaymentId);
          await tx.insert(repayment).values({
            id: repaymentId,
            orgId: input.orgId,
            loanId,
            memberId: input.memberId,
            amount: sumLines(lines),
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
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });
          childOrder += 1;
        }

        for (const [cycleKey, lines] of groupContributionAllocations(preview.allocations)) {
          const contributionId = randomUUID();
          const cycleId = contributionCycleForGroup(cycleKey, lines, input);
          childLinks.contributions.set(cycleKey, contributionId);
          if (cycleKey !== cycleId) {
            childLinks.contributions.set(cycleId, contributionId);
          }
          await tx.insert(contribution).values({
            id: contributionId,
            orgId: input.orgId,
            cycleId,
            memberId: input.memberId,
            kind: "regular",
            paymentSource: input.paymentSource,
            amount: sumLines(lines),
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
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: ACTOR_KIND,
          });
          childOrder += 1;
        }

        const persistedAllocations = preview.allocations.map((line) => ({
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
          cycleId: line.cycleId ?? null,
          repaymentId: line.loanId ? childLinks.repayments.get(line.loanId) ?? null : null,
          contributionId: line.kind.startsWith("contribution_") || line.kind === "extra_savings"
            ? childLinks.contributions.get(line.cycleId ?? "extra_savings") ?? null
            : null,
          brId: line.brId,
          groupConfigVersion: line.groupConfigVersion,
          createdAt: now,
        }));
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
              repaymentId: line.repaymentId,
              contributionId: line.contributionId,
            })),
          },
          reason: null,
          at: now,
          createdAt: now,
        });

        await refreshReadModels(tx);
      });

      return {
        receiptId,
        allocations: preview.allocations,
        unappliedAmount: preview.unappliedAmount,
        requiresExtraDecision: preview.requiresExtraDecision,
      };
    },
  };
}
