import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  auditLogEntry,
  contributionCycle,
  entityVersion,
  loanActivityPoints,
  member,
  memberTimeWeightedBalance,
  periodClose,
  statementArchive,
  statementArchiveSupersession,
  surplusGovernanceDecision,
  withdrawal,
  yearEndBalanceSnapshot,
  yearEndBalanceSnapshotLine,
  yearEndShareOut,
  yearEndShareOutLine,
  yearEndShareOutReversal,
} from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";
import { canonicalJson, sha256Hex } from "./reporting";
import { formatMoney4Units, parseMoney4Units } from "./money4";
import { assertShareOutReversalAllowed, buildShareOutReversalPlan, isPositiveMoney4 } from "./year-end-reversal";
import type { ShareOutReversalLineInput, ShareOutReversalPlan } from "./year-end-reversal";

function cents4(value: string | number): bigint {
  return parseMoney4Units(String(value));
}

const ZERO = BigInt(0);
const TEN_THOUSAND = BigInt(10000);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money4(value: bigint): string {
  return formatMoney4Units(value);
}

export function fiscalYearForDate(dateOnly: string, input: { startMonth: number; startDay: number }): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const startsThisYear = month > input.startMonth || (month === input.startMonth && day >= input.startDay);
  return startsThisYear ? year : year - 1;
}

export function computeTwoPoolDraft(input: {
  repartoTotal: string;
  loanPoolPct: string;
  savingsPoolPct: string;
  members: Array<{ memberId: string; accumulatedSavings: string; saldoPonderadoUsdDias: string; loanActivityBasis: string }>;
}) {
  const total = cents4(input.repartoTotal);
  const loanPool = total * cents4(input.loanPoolPct) / TEN_THOUSAND;
  const savingsPool = total - loanPool;
  const loanBasisTotal = input.members.reduce((sum, row) => sum + cents4(row.loanActivityBasis), ZERO);
  const weightedTotal = input.members.reduce((sum, row) => sum + cents4(row.saldoPonderadoUsdDias), ZERO);
  const lines = input.members.map((row) => {
    const loanBonus = loanBasisTotal === ZERO ? ZERO : loanPool * cents4(row.loanActivityBasis) / loanBasisTotal;
    const savingsInterest = weightedTotal === ZERO ? ZERO : savingsPool * cents4(row.saldoPonderadoUsdDias) / weightedTotal;
    const draftShare = loanBonus + savingsInterest;
    return {
      memberId: row.memberId,
      accumulatedSavings: money4(cents4(row.accumulatedSavings)),
      loanActivityBasis: money4(cents4(row.loanActivityBasis)),
      loanBonusC: money4(loanBonus),
      savingsInterest: money4(savingsInterest),
      draftShareAmount: money4(draftShare),
      finalShareAmount: money4(draftShare),
    };
  });
  const totalDraft = lines.reduce((sum, row) => sum + cents4(row.draftShareAmount), ZERO);
  return {
    loanPoolAmount: money4(loanPool),
    savingsPoolAmount: money4(savingsPool),
    totalDraft: money4(totalDraft),
    lines,
  };
}

export function applyShareOutOverride(input: {
  repartoTotal: string;
  lineId: string;
  overrideAmount: string;
  reason: string;
  lines: Array<{ id: string; memberId: string; draftShareAmount: string; finalShareAmount: string }>;
}) {
  const override = cents4(input.overrideAmount);
  const reason = input.reason.trim();
  if (override !== ZERO && !reason) throw new Error("override_reason_required");
  const lines = input.lines.map((line) => line.id === input.lineId
    ? { ...line, finalShareAmount: money4(override), overrideReason: reason }
    : line);
  const finalTotal = lines.reduce((sum, line) => sum + cents4(line.finalShareAmount), ZERO);
  return {
    lines,
    ajusteAmount: money4(cents4(input.repartoTotal) - finalTotal),
  };
}

export function assertShareOutReconciled(input: {
  repartoTotal: string;
  ajusteAmount: string;
  lines: Array<{ finalShareAmount: string }>;
}) {
  const total = input.lines.reduce((sum, line) => sum + cents4(line.finalShareAmount), ZERO) + cents4(input.ajusteAmount);
  if (total !== cents4(input.repartoTotal)) {
    throw new Error("share_out_not_reconciled");
  }
}

export type ShareOutDraftView = typeof yearEndShareOut.$inferSelect & {
  lines: Array<typeof yearEndShareOutLine.$inferSelect & { memberName: string }>;
};

export type ShareOutArtifactInput = {
  orgId: string;
  canonicalPayloadHash: string;
  kind: "year_end_member" | "year_end_share_out" | "year_end_snapshot";
  periodLabel: string;
  payload: Record<string, unknown>;
};

export type ShareOutArtifactResult = {
  pdfUri: string;
  byteSize: number;
};

function totalMoney(lines: Array<{ value: string | null }>) {
  return money4(lines.reduce((sum, line) => sum + cents4(line.value ?? "0.0000"), ZERO));
}

function isYearEndShareOutArtifactKind(kind: string): kind is ShareOutArtifactInput["kind"] {
  return kind === "year_end_member" || kind === "year_end_share_out" || kind === "year_end_snapshot";
}

export function createShareOutService(options: { now?: () => Date } = {}) {
  const clock = options.now ?? (() => new Date());
  return {
    async getLatestDraft(input: { orgId: string; year?: number }): Promise<ShareOutDraftView | null> {
      return withTenantTransaction(input.orgId, async (tx) => {
        const [shareOut] = await tx.select().from(yearEndShareOut)
          .where(and(
            eq(yearEndShareOut.orgId, input.orgId),
            ...(input.year ? [eq(yearEndShareOut.year, input.year)] : []),
          ))
          .orderBy(desc(yearEndShareOut.createdAt))
          .limit(1);
        if (!shareOut) return null;
        const lines = await tx.select({
          line: yearEndShareOutLine,
          memberName: member.displayName,
        })
          .from(yearEndShareOutLine)
          .innerJoin(member, and(eq(member.id, yearEndShareOutLine.memberId), eq(member.orgId, yearEndShareOutLine.orgId)))
          .where(and(eq(yearEndShareOutLine.orgId, input.orgId), eq(yearEndShareOutLine.yearEndShareOutId, shareOut.id)))
          .orderBy(member.displayName);
        return {
          ...shareOut,
          lines: lines.map((row) => ({ ...row.line, memberName: row.memberName })),
        };
      });
    },
    async runDraft(input: { orgId: string; actorId: string; year: number; clientRequestId: string }) {
      if (!UUID_PATTERN.test(input.clientRequestId)) {
        throw new Error("share_out_client_request_id_invalid");
      }
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        await tx.execute(sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${'tenant-money:' + input.orgId}, 0))
        `);
        const [priorCommand] = await tx.select({
          subjectId: auditLogEntry.subjectId,
          payloadSnapshot: auditLogEntry.payloadSnapshot,
        }).from(auditLogEntry)
          .where(and(
            eq(auditLogEntry.orgId, input.orgId),
            eq(auditLogEntry.actionKind, "shareout.draft.created"),
            sql`${auditLogEntry.payloadSnapshot}->>'clientRequestId' = ${input.clientRequestId}`,
          ))
          .limit(1);
        if (priorCommand) {
          const payload = priorCommand.payloadSnapshot as { actorId?: unknown; year?: unknown; decisionId?: unknown };
          if (
            payload.actorId !== input.actorId
            || payload.year !== input.year
            || typeof payload.decisionId !== "string"
          ) {
            throw new Error("share_out_idempotency_conflict");
          }
          return {
            shareOutId: priorCommand.subjectId,
            decisionId: payload.decisionId,
            year: input.year,
          };
        }
        const [existingDraft] = await tx.select({ id: yearEndShareOut.id }).from(yearEndShareOut)
          .where(and(eq(yearEndShareOut.orgId, input.orgId), eq(yearEndShareOut.year, input.year)))
          .limit(1);
        if (existingDraft) throw new Error("share_out_already_exists");

        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_member_time_weighted_balance`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_loan_activity_points`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_distributable_surplus`);

        const [decision] = await tx.select().from(surplusGovernanceDecision)
          .where(and(
            eq(surplusGovernanceDecision.orgId, input.orgId),
            eq(surplusGovernanceDecision.year, input.year),
            eq(surplusGovernanceDecision.status, "approved"),
          ))
          .orderBy(desc(surplusGovernanceDecision.version))
          .limit(1);
        if (!decision) throw new Error("surplus_governance_decision_required");

        const [closeRow] = await tx.select({
          close: periodClose,
          periodLabel: contributionCycle.cycleLabel,
          closesOn: contributionCycle.closesOn,
        })
          .from(periodClose)
          .innerJoin(contributionCycle, and(eq(contributionCycle.id, periodClose.cycleId), eq(contributionCycle.orgId, periodClose.orgId)))
          .where(and(
            eq(periodClose.orgId, input.orgId),
            eq(periodClose.isYearEnd, true),
            sql`
              CASE
                WHEN make_date(
                  EXTRACT(YEAR FROM ${contributionCycle.closesOn})::integer,
                  COALESCE((SELECT gc.fiscal_year_start_month FROM group_config gc WHERE gc.org_id = ${periodClose.orgId} AND gc.valid_to IS NULL LIMIT 1), 1),
                  COALESCE((SELECT gc.fiscal_year_start_day FROM group_config gc WHERE gc.org_id = ${periodClose.orgId} AND gc.valid_to IS NULL LIMIT 1), 1)
                ) <= ${contributionCycle.closesOn}
                  THEN EXTRACT(YEAR FROM ${contributionCycle.closesOn})::integer
                ELSE EXTRACT(YEAR FROM ${contributionCycle.closesOn})::integer - 1
              END = ${input.year}
            `,
          ))
          .orderBy(desc(periodClose.closedAt))
          .limit(1);
        if (!closeRow) throw new Error("year_end_period_close_required");

        const liveBalanceResult = await tx.execute<{ liveBalance: string }>(sql`
          SELECT fund_pool_balance(${input.orgId}::uuid, ${closeRow.closesOn}::date)::text AS "liveBalance"
        `);
        const liveBalanceRows = Array.isArray(liveBalanceResult) ? liveBalanceResult : liveBalanceResult.rows ?? [];
        const liveBalance = String(liveBalanceRows[0]?.liveBalance ?? "0.0000");
        if (parseMoney4Units(decision.repartoTotal) > parseMoney4Units(liveBalance)) {
          throw new Error("share_out_exceeds_regularized_balance");
        }

        const weightedRows = await tx.select().from(memberTimeWeightedBalance)
          .where(and(eq(memberTimeWeightedBalance.orgId, input.orgId), eq(memberTimeWeightedBalance.fiscalYear, input.year)));
        const loanRows = await tx.select().from(loanActivityPoints)
          .where(and(eq(loanActivityPoints.orgId, input.orgId), eq(loanActivityPoints.fiscalYear, input.year)));
        const loanByMember = new Map(loanRows.map((row) => [row.memberId, row.loanActivityBasis]));
        const draft = computeTwoPoolDraft({
          repartoTotal: decision.repartoTotal,
          loanPoolPct: decision.loanPoolPct,
          savingsPoolPct: decision.savingsPoolPct,
          members: weightedRows.map((row) => ({
            memberId: row.memberId,
            accumulatedSavings: row.accumulatedSavings,
            saldoPonderadoUsdDias: row.saldoPonderadoUsdDias,
            loanActivityBasis: String(loanByMember.get(row.memberId) ?? "0.0000"),
          })),
        });
        const now = clock();
        const [shareOut] = await tx.insert(yearEndShareOut).values({
          orgId: input.orgId,
          year: input.year,
          periodCloseId: closeRow.close.id,
          formulaAtRun: "two_pool_v1",
          totalPoolAtRun: liveBalance,
          totalCommitment: decision.repartoTotal,
          totalApproved: null,
          surplusOrShortfallAtApproval: null,
          governanceDecisionId: decision.id,
          distributableSurplus: decision.distributableSurplus,
          cxcAnterior: "0.0000",
          repartoTotal: decision.repartoTotal,
          loanPoolAmount: draft.loanPoolAmount,
          savingsPoolAmount: draft.savingsPoolAmount,
          alicuotaPrestamos: decision.loanPoolPct,
          alicuotaAhorros: decision.savingsPoolPct,
          ajusteAmount: money4(cents4(decision.repartoTotal) - cents4(draft.totalDraft)),
          status: "draft",
          approvedAt: null,
          approvedBy: null,
          approvedByKind: null,
          createdAt: now,
          createdBy: input.actorId,
          createdByKind: "member",
        }).returning();

        for (const line of draft.lines) {
          await tx.insert(yearEndShareOutLine).values({
            orgId: input.orgId,
            yearEndShareOutId: shareOut.id,
            memberId: line.memberId,
            accumulatedSavingsAtRun: line.accumulatedSavings,
            loanActivityBasis: line.loanActivityBasis,
            loanBonusC: line.loanBonusC,
            savingsInterest: line.savingsInterest,
            draftShareAmount: line.draftShareAmount,
            overrideShareAmount: null,
            overrideReason: null,
            finalShareAmount: line.finalShareAmount,
            disposition: "payout",
            dispositionMotive: null,
            withdrawalId: null,
            retainedContributionId: null,
            memberStatementId: null,
            createdAt: now,
          });
        }
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "shareout.draft.created",
          subjectKind: "year_end_share_out",
          subjectId: shareOut.id,
          payloadSnapshot: {
            clientRequestId: input.clientRequestId,
            actorId: input.actorId,
            year: input.year,
            decisionId: decision.id,
            periodCloseId: closeRow.close.id,
            repartoTotal: decision.repartoTotal,
            totalPoolAtRun: liveBalance,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
        return { shareOutId: shareOut.id, decisionId: decision.id, year: input.year };
      });
    },
    async overrideLine(input: { orgId: string; actorId: string; lineId: string; overrideAmount: string; reason: string }) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [line] = await tx.select().from(yearEndShareOutLine)
          .where(and(eq(yearEndShareOutLine.orgId, input.orgId), eq(yearEndShareOutLine.id, input.lineId)))
          .limit(1);
        if (!line) throw new Error("share_out_line_not_found");
        const [shareOut] = await tx.select().from(yearEndShareOut)
          .where(and(eq(yearEndShareOut.orgId, input.orgId), eq(yearEndShareOut.id, line.yearEndShareOutId)))
          .limit(1);
        if (!shareOut || shareOut.status !== "draft") throw new Error("share_out_not_draft");
        const lines = await tx.select().from(yearEndShareOutLine)
          .where(and(eq(yearEndShareOutLine.orgId, input.orgId), eq(yearEndShareOutLine.yearEndShareOutId, shareOut.id)));
        const reconciled = applyShareOutOverride({
          repartoTotal: String(shareOut.repartoTotal ?? "0.0000"),
          lineId: line.id,
          overrideAmount: input.overrideAmount,
          reason: input.reason,
          lines: lines.map((row) => ({
            id: row.id,
            memberId: row.memberId,
            draftShareAmount: row.draftShareAmount,
            finalShareAmount: row.finalShareAmount,
          })),
        });
        const next = reconciled.lines.find((row) => row.id === line.id);
        if (!next) throw new Error("share_out_line_not_found");
        await tx.update(yearEndShareOutLine).set({
          overrideShareAmount: next.finalShareAmount,
          overrideReason: "overrideReason" in next ? next.overrideReason : null,
          finalShareAmount: next.finalShareAmount,
        }).where(eq(yearEndShareOutLine.id, line.id));
        await tx.update(yearEndShareOut).set({ ajusteAmount: reconciled.ajusteAmount })
          .where(eq(yearEndShareOut.id, shareOut.id));
        const now = new Date();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "shareout.override",
          subjectKind: "year_end_share_out_line",
          subjectId: line.id,
          payloadSnapshot: {
            shareOutId: shareOut.id,
            lineId: line.id,
            finalShareAmount: next.finalShareAmount,
            ajusteAmount: reconciled.ajusteAmount,
          },
          reason: input.reason,
          at: now,
          createdAt: now,
        });
        return { shareOutId: shareOut.id, ajusteAmount: reconciled.ajusteAmount };
      });
    },
    async approve(input: {
      orgId: string;
      actorId: string;
      shareOutId: string;
      createArtifact: (input: ShareOutArtifactInput) => Promise<ShareOutArtifactResult>;
    }) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [shareOut] = await tx.select().from(yearEndShareOut)
          .where(and(eq(yearEndShareOut.orgId, input.orgId), eq(yearEndShareOut.id, input.shareOutId)))
          .limit(1);
        if (!shareOut) throw new Error("share_out_not_found");
        if (shareOut.status !== "draft") throw new Error("share_out_not_draft");
        const lines = await tx.select({
          line: yearEndShareOutLine,
          memberName: member.displayName,
        }).from(yearEndShareOutLine)
          .innerJoin(member, and(eq(member.id, yearEndShareOutLine.memberId), eq(member.orgId, yearEndShareOutLine.orgId)))
          .where(and(eq(yearEndShareOutLine.orgId, input.orgId), eq(yearEndShareOutLine.yearEndShareOutId, input.shareOutId)));
        assertShareOutReconciled({
          repartoTotal: String(shareOut.repartoTotal ?? "0.0000"),
          ajusteAmount: String(shareOut.ajusteAmount ?? "0.0000"),
          lines: lines.map((row) => ({ finalShareAmount: String(row.line.finalShareAmount) })),
        });
        const now = new Date();
        const periodLabel = String(shareOut.year);
        for (const row of lines) {
          const line = row.line;
          const [withdrawalRow] = await tx.insert(withdrawal).values({
            orgId: input.orgId,
            memberId: line.memberId,
            amount: line.finalShareAmount,
            currencyCode: "USD",
            datedOn: now.toISOString().slice(0, 10),
            recordedAt: now,
            kind: "year_end_share_out",
            shareOutId: shareOut.id,
            notes: "Reparto fin de año",
            reversesId: null,
            reverseReason: null,
            adjustmentCycleId: null,
            clientRequestId: null,
            createdAt: now,
            createdBy: input.actorId,
            createdByKind: "member",
            yearEndShareOutLineId: line.id,
          }).returning();
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "shareout.withdrawal.create",
            subjectKind: "withdrawal",
            subjectId: withdrawalRow.id,
            payloadSnapshot: {
              shareOutId: shareOut.id,
              lineId: line.id,
              memberId: line.memberId,
              amount: line.finalShareAmount,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
          const memberPayload = {
            kind: "year_end_member",
            year: shareOut.year,
            shareOutId: shareOut.id,
            lineId: line.id,
            memberId: line.memberId,
            memberName: row.memberName,
            finalShareAmount: line.finalShareAmount,
            withdrawalId: withdrawalRow.id,
            generatedAt: now.toISOString(),
          };
          const memberHash = sha256Hex(canonicalJson(memberPayload));
          const memberArtifact = await input.createArtifact({
            orgId: input.orgId,
            canonicalPayloadHash: memberHash,
            kind: "year_end_member",
            periodLabel,
            payload: memberPayload,
          });
          const [memberStatement] = await tx.insert(statementArchive).values({
            orgId: input.orgId,
            kind: "year_end_member",
            memberId: line.memberId,
            periodLabel,
            pdfUri: memberArtifact.pdfUri,
            canonicalPayloadHash: memberHash,
            generatedAt: now,
            periodCloseId: shareOut.periodCloseId,
            yearEndShareOutId: shareOut.id,
            byteSize: memberArtifact.byteSize,
            createdAt: now,
            createdByKind: "member",
          }).returning();
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "statement.generated",
            subjectKind: "statement_archive",
            subjectId: memberStatement.id,
            payloadSnapshot: {
              kind: "year_end_member",
              memberId: line.memberId,
              shareOutId: shareOut.id,
              canonicalPayloadHash: memberHash,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
          await tx.update(yearEndShareOutLine).set({
            withdrawalId: withdrawalRow.id,
            memberStatementId: memberStatement.id,
          }).where(eq(yearEndShareOutLine.id, line.id));
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "shareout.line.link_artifacts",
            subjectKind: "year_end_share_out_line",
            subjectId: line.id,
            payloadSnapshot: {
              withdrawalId: withdrawalRow.id,
              memberStatementId: memberStatement.id,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
        }
        const updatedLines = await tx.select().from(yearEndShareOutLine)
          .where(and(eq(yearEndShareOutLine.orgId, input.orgId), eq(yearEndShareOutLine.yearEndShareOutId, input.shareOutId)));
        const shareOutPayload = {
          kind: "year_end_share_out",
          year: shareOut.year,
          shareOutId: shareOut.id,
          repartoTotal: shareOut.repartoTotal,
          ajusteAmount: shareOut.ajusteAmount,
          lines: updatedLines.map((line) => ({
            memberId: line.memberId,
            finalShareAmount: line.finalShareAmount,
            withdrawalId: line.withdrawalId,
            memberStatementId: line.memberStatementId,
          })),
          generatedAt: now.toISOString(),
        };
        const shareOutHash = sha256Hex(canonicalJson(shareOutPayload));
        const shareOutArtifact = await input.createArtifact({
          orgId: input.orgId,
          canonicalPayloadHash: shareOutHash,
          kind: "year_end_share_out",
          periodLabel,
          payload: shareOutPayload,
        });
        const [shareOutStatement] = await tx.insert(statementArchive).values({
          orgId: input.orgId,
          kind: "year_end_share_out",
          memberId: null,
          periodLabel,
          pdfUri: shareOutArtifact.pdfUri,
          canonicalPayloadHash: shareOutHash,
          generatedAt: now,
          periodCloseId: shareOut.periodCloseId,
          yearEndShareOutId: shareOut.id,
          byteSize: shareOutArtifact.byteSize,
          createdAt: now,
          createdByKind: "member",
        }).returning();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "statement.generated",
          subjectKind: "statement_archive",
          subjectId: shareOutStatement.id,
          payloadSnapshot: {
            kind: "year_end_share_out",
            shareOutId: shareOut.id,
            canonicalPayloadHash: shareOutHash,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
        const snapshotPayload = {
          kind: "year_end_snapshot",
          year: shareOut.year,
          shareOutId: shareOut.id,
          lines: updatedLines.map((line) => ({
            memberId: line.memberId,
            ahorrosBalance: line.accumulatedSavingsAtRun,
            cuotaAcumulada: line.finalShareAmount,
            prestamosPorCobrar: line.loanActivityBasis ?? "0.0000",
            interesPorCobrar: "0.0000",
          })),
          generatedAt: now.toISOString(),
        };
        const snapshotHash = sha256Hex(canonicalJson(snapshotPayload));
        const snapshotArtifact = await input.createArtifact({
          orgId: input.orgId,
          canonicalPayloadHash: snapshotHash,
          kind: "year_end_snapshot",
          periodLabel,
          payload: snapshotPayload,
        });
        const [snapshotArchive] = await tx.insert(statementArchive).values({
          orgId: input.orgId,
          kind: "year_end_snapshot",
          memberId: null,
          periodLabel,
          pdfUri: snapshotArtifact.pdfUri,
          canonicalPayloadHash: snapshotHash,
          generatedAt: now,
          periodCloseId: shareOut.periodCloseId,
          yearEndShareOutId: shareOut.id,
          byteSize: snapshotArtifact.byteSize,
          createdAt: now,
          createdByKind: "member",
        }).returning();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "statement.generated",
          subjectKind: "statement_archive",
          subjectId: snapshotArchive.id,
          payloadSnapshot: {
            kind: "year_end_snapshot",
            shareOutId: shareOut.id,
            canonicalPayloadHash: snapshotHash,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
        const [snapshot] = await tx.insert(yearEndBalanceSnapshot).values({
          orgId: input.orgId,
          year: shareOut.year,
          snapshotDate: now.toISOString().slice(0, 10),
          periodCloseId: shareOut.periodCloseId,
          priorSnapshotId: null,
          totalAhorros: totalMoney(updatedLines.map((line) => ({ value: line.accumulatedSavingsAtRun }))),
          totalCuotaAcumulada: totalMoney(updatedLines.map((line) => ({ value: line.finalShareAmount }))),
          totalPrestamosPorCobrar: totalMoney(updatedLines.map((line) => ({ value: line.loanActivityBasis }))),
          totalInteresPorCobrar: "0.0000",
          bancoBalance: totalMoney(updatedLines.map((line) => ({ value: line.accumulatedSavingsAtRun }))),
          cxcAnterior: String(shareOut.cxcAnterior ?? "0.0000"),
          groupConfigVersion: 1,
          canonicalPayloadHash: snapshotHash,
          statementArchiveId: snapshotArchive.id,
          createdAt: now,
          createdByKind: "member",
        }).returning();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "shareout.snapshot.create",
          subjectKind: "year_end_balance_snapshot",
          subjectId: snapshot.id,
          payloadSnapshot: {
            shareOutId: shareOut.id,
            year: shareOut.year,
            canonicalPayloadHash: snapshotHash,
            statementArchiveId: snapshotArchive.id,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
        for (const line of updatedLines) {
          const [snapshotLine] = await tx.insert(yearEndBalanceSnapshotLine).values({
            orgId: input.orgId,
            snapshotId: snapshot.id,
            memberId: line.memberId,
            ahorrosBalance: line.accumulatedSavingsAtRun,
            cuotaAcumulada: line.finalShareAmount,
            prestamosPorCobrar: line.loanActivityBasis ?? "0.0000",
            interesPorCobrar: "0.0000",
            createdAt: now,
          }).returning();
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "shareout.snapshot_line.create",
            subjectKind: "year_end_balance_snapshot_line",
            subjectId: snapshotLine.id,
            payloadSnapshot: {
              snapshotId: snapshot.id,
              memberId: line.memberId,
            },
            reason: null,
            at: now,
            createdAt: now,
          });
        }
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_member_compliance_state`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_available_capital`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_cash_balances`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_liquidez_proyectada`);
        await tx.update(yearEndShareOut).set({
          status: "distributed",
          approvedAt: now,
          approvedBy: input.actorId,
          approvedByKind: "member",
          totalApproved: shareOut.repartoTotal,
        }).where(eq(yearEndShareOut.id, shareOut.id));
        if (shareOut.governanceDecisionId) {
          await tx.update(surplusGovernanceDecision).set({
            status: "locked",
          }).where(and(
            eq(surplusGovernanceDecision.orgId, input.orgId),
            eq(surplusGovernanceDecision.id, shareOut.governanceDecisionId),
          ));
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "shareout.governance.lock",
            subjectKind: "surplus_governance_decision",
            subjectId: shareOut.governanceDecisionId,
            payloadSnapshot: { shareOutId: shareOut.id, year: shareOut.year },
            reason: null,
            at: now,
            createdAt: now,
          });
        }
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "shareout.approved",
          subjectKind: "year_end_share_out",
          subjectId: shareOut.id,
          payloadSnapshot: { shareOutId: shareOut.id, year: shareOut.year, totalApproved: shareOut.repartoTotal },
          reason: null,
          at: now,
          createdAt: now,
        });
        return { shareOutId: shareOut.id, withdrawalsCreated: lines.length };
      });
    },
    async reverseApprovedShareOut(input: {
      orgId: string;
      actorId: string;
      shareOutId: string;
      reason: string;
      createArtifact: (input: ShareOutArtifactInput) => Promise<ShareOutArtifactResult>;
      graceHours?: number;
    }) {
      const phase = await withWritableTenantTransaction(input.orgId, async (tx) => {
        const [shareOut] = await tx.select().from(yearEndShareOut)
          .where(and(eq(yearEndShareOut.orgId, input.orgId), eq(yearEndShareOut.id, input.shareOutId)))
          .limit(1);
        if (!shareOut) throw new Error("share_out_not_found");

        const [existingReversal] = await tx.select().from(yearEndShareOutReversal)
          .where(and(
            eq(yearEndShareOutReversal.orgId, input.orgId),
            eq(yearEndShareOutReversal.yearEndShareOutId, input.shareOutId),
          ))
          .limit(1);
        if (existingReversal) {
          const archives = await tx.select().from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, input.orgId),
              eq(statementArchive.yearEndShareOutId, input.shareOutId),
            ));
          return {
            reversed: false,
            reversalId: existingReversal.id,
            shareOutId: input.shareOutId,
            offsetsCreated: 0,
            shareOut,
            reversal: existingReversal,
            plan: existingReversal.reversalPayload as ShareOutReversalPlan,
            archives,
            reason: existingReversal.reason,
            reversedAt: existingReversal.reversedAt,
          };
        }

        const reversedAt = clock();
        assertShareOutReversalAllowed({
          status: shareOut.status,
          approvedAt: shareOut.approvedAt,
          now: reversedAt,
          graceHours: input.graceHours ?? 24,
        });

        const lines = await tx.select().from(yearEndShareOutLine)
          .where(and(
            eq(yearEndShareOutLine.orgId, input.orgId),
            eq(yearEndShareOutLine.yearEndShareOutId, input.shareOutId),
          ));
        const paidLines: ShareOutReversalLineInput[] = [];
        for (const line of lines) {
          if (!isPositiveMoney4(String(line.finalShareAmount))) continue;
          if (!line.withdrawalId) throw new Error("share_out_reversal_original_withdrawal_required");
          const [originalWithdrawal] = await tx.select().from(withdrawal)
            .where(and(
              eq(withdrawal.orgId, input.orgId),
              eq(withdrawal.id, line.withdrawalId),
              eq(withdrawal.shareOutId, input.shareOutId),
              eq(withdrawal.yearEndShareOutLineId, line.id),
              eq(withdrawal.memberId, line.memberId),
              eq(withdrawal.kind, "year_end_share_out"),
            ))
            .limit(1);
          if (!originalWithdrawal) throw new Error("share_out_reversal_original_withdrawal_required");
          paidLines.push({
            id: line.id,
            memberId: line.memberId,
            finalShareAmount: String(originalWithdrawal.amount),
            withdrawalId: originalWithdrawal.id,
          });
        }
        const plan = buildShareOutReversalPlan({
          shareOutId: input.shareOutId,
          reason: input.reason,
          lines: paidLines,
        });
        const [reversal] = await tx.insert(yearEndShareOutReversal).values({
          orgId: input.orgId,
          yearEndShareOutId: input.shareOutId,
          reason: plan.reason,
          reversedAt,
          reversedBy: input.actorId,
          reversalPayload: plan,
          createdAt: reversedAt,
        }).onConflictDoNothing().returning();
        if (!reversal) {
          const [raceWinner] = await tx.select().from(yearEndShareOutReversal)
            .where(and(
              eq(yearEndShareOutReversal.orgId, input.orgId),
              eq(yearEndShareOutReversal.yearEndShareOutId, input.shareOutId),
            ))
            .limit(1);
          if (!raceWinner) throw new Error("share_out_reversal_conflict");
          return {
            reversed: false,
            reversalId: raceWinner.id,
            shareOutId: input.shareOutId,
            offsetsCreated: 0,
            shareOut,
            reversal: raceWinner,
            plan: raceWinner.reversalPayload as ShareOutReversalPlan,
            archives: await tx.select().from(statementArchive)
              .where(and(
                eq(statementArchive.orgId, input.orgId),
                eq(statementArchive.yearEndShareOutId, input.shareOutId),
              )),
            reason: raceWinner.reason,
            reversedAt: raceWinner.reversedAt,
          };
        }

        let offsetsCreated = 0;
        for (const offset of plan.withdrawalOffsets) {
          const [withdrawalRow] = await tx.insert(withdrawal).values({
            orgId: input.orgId,
            memberId: offset.memberId,
            amount: offset.amount,
            currencyCode: "USD",
            datedOn: reversedAt.toISOString().slice(0, 10),
            recordedAt: reversedAt,
            kind: "year_end_reversal",
            shareOutId: input.shareOutId,
            notes: "Reverso reparto fin de año",
            reversesId: offset.reversesId,
            reverseReason: plan.reason,
            adjustmentCycleId: null,
            clientRequestId: null,
            createdAt: reversedAt,
            createdBy: input.actorId,
            createdByKind: "member",
            yearEndShareOutLineId: offset.lineId,
          }).returning();
          offsetsCreated += 1;
          await tx.insert(auditLogEntry).values({
            orgId: input.orgId,
            actorKind: "member",
            actorId: input.actorId,
            actionKind: "shareout.withdrawal.reverse",
            subjectKind: "withdrawal",
            subjectId: withdrawalRow.id,
            payloadSnapshot: {
              shareOutId: input.shareOutId,
              reversalId: reversal.id,
              lineId: offset.lineId,
              amount: offset.amount,
              reversesId: offset.reversesId,
            },
            reason: plan.reason,
            at: reversedAt,
            createdAt: reversedAt,
          });
        }

        const archives = await tx.select().from(statementArchive)
          .where(and(
            eq(statementArchive.orgId, input.orgId),
            eq(statementArchive.yearEndShareOutId, input.shareOutId),
          ));
        const [latestVersion] = await tx.select().from(entityVersion)
          .where(and(
            eq(entityVersion.orgId, input.orgId),
            eq(entityVersion.entityKind, "YearEndShareOut"),
            eq(entityVersion.entityId, input.shareOutId),
          ))
          .orderBy(desc(entityVersion.version))
          .limit(1);
        const nextVersion = (Number(latestVersion?.version ?? 0) || 0) + 1;

        await tx.update(yearEndShareOut).set({
          status: "reversed",
        }).where(and(eq(yearEndShareOut.orgId, input.orgId), eq(yearEndShareOut.id, input.shareOutId)));
        await tx.insert(entityVersion).values({
          orgId: input.orgId,
          entityKind: "YearEndShareOut",
          entityId: input.shareOutId,
          version: nextVersion,
          validFrom: reversedAt,
          validTo: null,
          payloadSnapshot: {
            ...shareOut,
            status: "reversed",
            reversalId: reversal.id,
          },
          changeKind: "status_transition",
          changeReason: plan.reason,
          createdAt: reversedAt,
          createdBy: input.actorId,
          createdByKind: "member",
        });
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "year_end_share_out.reversed",
          subjectKind: "year_end_share_out",
          subjectId: input.shareOutId,
          payloadSnapshot: {
            shareOutId: input.shareOutId,
            reversalId: reversal.id,
            offsetsCreated,
            supersededStatementArchiveIds: archives.map((archive) => archive.id),
          },
          reason: plan.reason,
          at: reversedAt,
          createdAt: reversedAt,
        });
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_member_compliance_state`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_available_capital`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_cash_balances`);
        await tx.execute(sql`REFRESH MATERIALIZED VIEW mv_liquidez_proyectada`);

        return {
          reversed: true,
          reversalId: reversal.id,
          shareOutId: input.shareOutId,
          offsetsCreated,
          shareOut,
          reversal,
          plan,
          archives,
          reason: plan.reason,
          reversedAt,
        };
      });
      const supersedingArchiveIds: string[] = [];
      for (const archive of phase.archives) {
        if (!isYearEndShareOutArtifactKind(archive.kind)) continue;
        if (String(archive.periodLabel).endsWith(`-reversal-${phase.reversal.id}`)) continue;
        const supersedingPeriodLabel = `${archive.periodLabel}-reversal-${phase.reversal.id}`;
        const existingSupersedingId = await withWritableTenantTransaction(input.orgId, async (tx) => {
          const [existingSupersession] = await tx.select().from(statementArchiveSupersession)
            .where(and(
              eq(statementArchiveSupersession.orgId, input.orgId),
              eq(statementArchiveSupersession.supersededStatementArchiveId, archive.id),
              eq(statementArchiveSupersession.yearEndShareOutReversalId, phase.reversal.id),
            ))
            .limit(1);
          if (existingSupersession?.supersedingStatementArchiveId) {
            return existingSupersession.supersedingStatementArchiveId;
          }

          const [existingArchive] = await tx.select().from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, input.orgId),
              eq(statementArchive.kind, archive.kind),
              archive.memberId ? eq(statementArchive.memberId, archive.memberId) : isNull(statementArchive.memberId),
              eq(statementArchive.periodLabel, supersedingPeriodLabel),
              eq(statementArchive.yearEndShareOutId, input.shareOutId),
            ))
            .limit(1);
          if (!existingArchive) {
            return null;
          }

          await tx.insert(statementArchiveSupersession).values({
            orgId: input.orgId,
            supersededStatementArchiveId: archive.id,
            supersedingStatementArchiveId: existingArchive.id,
            yearEndShareOutReversalId: phase.reversal.id,
            reason: phase.reason,
            createdAt: phase.reversedAt,
          }).onConflictDoNothing();
          return existingArchive.id;
        });
        if (existingSupersedingId) {
          supersedingArchiveIds.push(existingSupersedingId);
          continue;
        }

        const supersedingPayload = {
          kind: archive.kind,
          reversalKind: "year_end_share_out_reversal",
          year: phase.shareOut.year,
          shareOutId: input.shareOutId,
          reversalId: phase.reversal.id,
          reversedAt: phase.reversedAt.toISOString(),
          supersededStatementArchiveId: archive.id,
          supersededPayloadHash: archive.canonicalPayloadHash,
          memberId: archive.memberId,
          reason: phase.reason,
          withdrawalOffsets: phase.plan.withdrawalOffsets,
        };
        const supersedingHash = sha256Hex(canonicalJson(supersedingPayload));
        const supersedingArtifact = await input.createArtifact({
          orgId: input.orgId,
          canonicalPayloadHash: supersedingHash,
          kind: archive.kind,
          periodLabel: String(archive.periodLabel),
          payload: supersedingPayload,
        });
        await withWritableTenantTransaction(input.orgId, async (tx) => {
          const [existingArchive] = await tx.select().from(statementArchive)
            .where(and(
              eq(statementArchive.orgId, input.orgId),
              eq(statementArchive.kind, archive.kind),
              archive.memberId ? eq(statementArchive.memberId, archive.memberId) : isNull(statementArchive.memberId),
              eq(statementArchive.periodLabel, supersedingPeriodLabel),
              eq(statementArchive.yearEndShareOutId, input.shareOutId),
            ))
            .limit(1);
          if (existingArchive) {
            await tx.insert(statementArchiveSupersession).values({
              orgId: input.orgId,
              supersededStatementArchiveId: archive.id,
              supersedingStatementArchiveId: existingArchive.id,
              yearEndShareOutReversalId: phase.reversal.id,
              reason: phase.reason,
              createdAt: phase.reversedAt,
            }).onConflictDoNothing();
            supersedingArchiveIds.push(existingArchive.id);
            return;
          }

          const [supersedingArchive] = await tx.insert(statementArchive).values({
            orgId: input.orgId,
            kind: archive.kind,
            memberId: archive.memberId,
            periodLabel: supersedingPeriodLabel,
            pdfUri: supersedingArtifact.pdfUri,
            canonicalPayloadHash: supersedingHash,
            generatedAt: phase.reversedAt,
            periodCloseId: archive.periodCloseId ?? phase.shareOut.periodCloseId,
            yearEndShareOutId: input.shareOutId,
            byteSize: supersedingArtifact.byteSize,
            createdAt: phase.reversedAt,
            createdByKind: "member",
          }).onConflictDoNothing().returning();
          if (!supersedingArchive) return;
          supersedingArchiveIds.push(supersedingArchive.id);
          await tx.insert(statementArchiveSupersession).values({
            orgId: input.orgId,
            supersededStatementArchiveId: archive.id,
            supersedingStatementArchiveId: supersedingArchive.id,
            yearEndShareOutReversalId: phase.reversal.id,
            reason: phase.reason,
            createdAt: phase.reversedAt,
          }).onConflictDoNothing();
        });
      }
      return {
        reversed: phase.reversed,
        reversalId: phase.reversalId,
        shareOutId: phase.shareOutId,
        offsetsCreated: phase.offsetsCreated,
        supersedingArchiveIds,
      };
    },
  };
}
