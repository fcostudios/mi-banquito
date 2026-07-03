import { and, eq } from "drizzle-orm";
import { withTenantTransaction } from "@mi-banquito/db/tenant";
import { alert, auditLogEntry, periodClose, reconciliationCycle } from "@mi-banquito/db/schema";
import { type AuditWriter, writeWithAudit } from "./audit";

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

export function buildAdjustmentWindow({ openedAt, days = DEFAULT_ADJUSTMENT_WINDOW_DAYS }: AdjustmentWindowInput): AdjustmentWindow {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("adjustment window days must be positive");
  }

  return {
    opensAt: openedAt,
    closesAt: new Date(openedAt.getTime() + days * MS_PER_DAY),
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
  now?: () => Date;
}

export interface ReconciliationService {
  readonly context: "reconciliation";
  openAdjustmentPeriod(input: OpenAdjustmentPeriodInput): Promise<typeof reconciliationCycle.$inferSelect>;
}

const defaultAuditWriter: AdjustmentAuditWriter = async ({ tx, entry }) => {
  await tx.insert(auditLogEntry).values(entry);
};

const requireAdjustmentReason = (reason: string): string => {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("reason is required to open an adjustment period");
  }
  return trimmed;
};

export const createReconciliationService = (options: ReconciliationServiceOptions = {}): ReconciliationService => {
  const auditWriter = options.auditWriter ?? defaultAuditWriter;
  const now = options.now ?? (() => new Date());

  return {
    context: "reconciliation",
    async openAdjustmentPeriod(input) {
      const reason = requireAdjustmentReason(input.reason);
      if (input.confirmed !== true) {
        throw new Error("confirmation is required to open an adjustment period");
      }

      return withTenantTransaction(input.orgId, async (tx) => {
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
