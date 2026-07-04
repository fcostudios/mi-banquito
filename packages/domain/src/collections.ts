import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { alert, arAging, auditLogEntry, promise, promiseReminder } from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";

export type AgingRow = {
  daysLate: number;
};

export type DateOnlyString = `${number}-${number}-${number}`;

export type PromiseSourceKind = "loan" | "cycle";

export type PromiseSourceRef =
  | { loanId: string; cycleId: null }
  | { loanId: null; cycleId: string };

export type PromiseSourceInput =
  | { sourceKind: PromiseSourceKind; sourceId: string | null | undefined }
  | { loanId?: string | null; cycleId?: string | null };

export type ChaseObligationKind = "aporte" | "cuota";

export type ChaseMessageInput =
  | { memberName: string; reasonKind: ChaseObligationKind; periodLabel: string }
  | { member: string; obligationKind: ChaseObligationKind; period: string };

export type PromiseStatus = "open" | "kept" | "broken" | "closed";

export type PromiseReminderRow = {
  status: PromiseStatus | string;
  promisedOn: DateOnlyString;
};

export type CollectionsAgingReasonKind = ChaseObligationKind;

export type CollectionsAgingRow = typeof arAging.$inferSelect & {
  id: string;
  reasonKind: CollectionsAgingReasonKind | string;
};

export type MarkPromiseInput = PromiseSourceInput & {
  orgId: string;
  actorId: string;
  memberId: string;
  promisedOn: DateOnlyString;
  note?: string | null;
  todayIso?: DateOnlyString;
};

export type RecordChaseAttemptInput = PromiseSourceInput & {
  orgId: string;
  actorId: string;
  memberId: string;
  message: string;
};

export type EmitPromiseRemindersResult = {
  promisesScanned: number;
  remindersEmitted: number;
};

export interface CollectionsService {
  readonly context: "collections";
  listAgingRows(orgId: string, reasonKind?: CollectionsAgingReasonKind): Promise<CollectionsAgingRow[]>;
  markPromise(input: MarkPromiseInput): Promise<{ promiseId: string }>;
  recordChaseAttempt(input: RecordChaseAttemptInput): Promise<void>;
  emitPromiseReminders(todayIso: DateOnlyString): Promise<EmitPromiseRemindersResult>;
}

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function requireNonEmptyId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function dateParts(value: DateOnlyString): { year: number; month: number; day: number } {
  const match = dateOnlyPattern.exec(value);
  if (!match) {
    throw new Error("date_must_be_date_only");
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() + 1 !== parts.month
    || date.getUTCDate() !== parts.day
  ) {
    throw new Error("date_must_be_valid");
  }
  return parts;
}

function dateOnlyFromParts(year: number, month: number, day: number): DateOnlyString {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-") as DateOnlyString;
}

function dateOnly(value: Date): DateOnlyString {
  return dateOnlyFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function addDays(value: DateOnlyString, days: number): DateOnlyString {
  const parts = dateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return dateOnly(date);
}

export function sortAgingRows<T extends AgingRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareAgingRows(a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);
}

function compareOptionalString(a: string | undefined, b: string | undefined): number {
  if (a === b) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return a < b ? -1 : 1;
}

function stringField(row: AgingRow, field: "memberName" | "dueDate" | "id"): string | undefined {
  const value = (row as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function compareAgingRows(a: AgingRow, b: AgingRow): number {
  return (
    b.daysLate - a.daysLate
    || compareOptionalString(stringField(a, "memberName"), stringField(b, "memberName"))
    || compareOptionalString(stringField(a, "dueDate"), stringField(b, "dueDate"))
    || compareOptionalString(stringField(a, "id"), stringField(b, "id"))
  );
}

export function defaultPromiseDate(today: DateOnlyString): DateOnlyString {
  return addDays(today, 7);
}

export function normalizePromiseSourceRef(input: PromiseSourceInput): PromiseSourceRef {
  if ("sourceKind" in input) {
    const sourceId = requireNonEmptyId(input.sourceId);
    if (!sourceId) {
      throw new Error("promise_source_required");
    }
    return input.sourceKind === "loan"
      ? { loanId: sourceId, cycleId: null }
      : { loanId: null, cycleId: sourceId };
  }

  const loanId = requireNonEmptyId(input.loanId);
  const cycleId = requireNonEmptyId(input.cycleId);
  if ((loanId ? 1 : 0) + (cycleId ? 1 : 0) !== 1) {
    throw new Error("promise_source_must_be_exactly_one");
  }
  if (loanId) {
    return { loanId, cycleId: null };
  }
  if (cycleId) {
    return { loanId: null, cycleId };
  }
  throw new Error("promise_source_must_be_exactly_one");
}

export function buildChaseMessage(input: ChaseMessageInput): string {
  const memberName = "memberName" in input ? input.memberName : input.member;
  const reasonKind = "reasonKind" in input ? input.reasonKind : input.obligationKind;
  const periodLabel = "periodLabel" in input ? input.periodLabel : input.period;
  return `Hola ${memberName}, te comparto que tu ${reasonKind} de ${periodLabel} aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.`;
}

export function buildWhatsAppChaseUrl(input: {
  whatsappNumber: string | null | undefined;
  message: string;
}): string | null {
  const number = input.whatsappNumber?.replace(/\D/g, "") ?? "";
  if (!number) {
    return null;
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(input.message)}`;
}

export function promiseReminderCandidates<T extends PromiseReminderRow>(
  promises: readonly T[],
  today: DateOnlyString,
): T[] {
  dateParts(today);
  for (const promise of promises) {
    dateParts(promise.promisedOn);
  }
  const cutoff = today;
  return promises.filter((promise) => (
    promise.status === "open" && promise.promisedOn <= cutoff
  ));
}

function agingRowId(row: typeof arAging.$inferSelect): string {
  return [
    row.orgId,
    row.memberId ?? "no-member",
    row.reasonKind,
    row.loanId ?? "no-loan",
    row.cycleId ?? "no-cycle",
    row.periodLabel,
  ].join(":");
}

function assertNotPast(input: { promisedOn: DateOnlyString; todayIso: DateOnlyString }): void {
  dateParts(input.promisedOn);
  dateParts(input.todayIso);
  if (input.promisedOn < input.todayIso) {
    throw new Error("La fecha de promesa debe ser hoy o una fecha futura.");
  }
}

function trimmedNote(note: string | null | undefined): string | null {
  const normalized = note?.trim();
  return normalized ? normalized : null;
}

function systemActorId(): string {
  return "00000000-0000-0000-0000-000000000000";
}

export function createCollectionsService(): CollectionsService {
  return {
    context: "collections",
    async listAgingRows(orgId, reasonKind) {
      const rows = await withTenantTransaction(orgId, async (tx) => tx.select().from(arAging)
        .where(reasonKind
          ? and(eq(arAging.orgId, orgId), eq(arAging.reasonKind, reasonKind))
          : eq(arAging.orgId, orgId))
        .orderBy(desc(arAging.daysLate), arAging.memberName, arAging.dueDate));

      return sortAgingRows(rows.map((row) => ({
        ...row,
        id: agingRowId(row),
      })));
    },
    async markPromise(input) {
      const source = normalizePromiseSourceRef(input);
      const todayIso = input.todayIso ?? dateOnly(new Date());
      assertNotPast({ promisedOn: input.promisedOn, todayIso });

      const promiseId = randomUUID();
      const now = new Date();
      const note = trimmedNote(input.note);

      await withTenantTransaction(input.orgId, async (tx) => {
        const openRows = await tx.select().from(promise)
          .where(and(
            eq(promise.orgId, input.orgId),
            eq(promise.memberId, input.memberId),
            source.loanId ? eq(promise.loanId, source.loanId) : isNull(promise.loanId),
            source.cycleId ? eq(promise.cycleId, source.cycleId) : isNull(promise.cycleId),
            eq(promise.status, "open"),
          ));

        for (const row of openRows) {
          await tx.update(promise)
            .set({ status: "closed", supersededById: null })
            .where(and(eq(promise.orgId, input.orgId), eq(promise.id, row.id)));
        }

        await tx.insert(promise).values({
          id: promiseId,
          orgId: input.orgId,
          memberId: input.memberId,
          loanId: source.loanId,
          cycleId: source.cycleId,
          promisedOn: input.promisedOn,
          note,
          status: "open",
          supersededById: null,
          createdBy: input.actorId,
          createdAt: now,
        });

        for (const row of openRows) {
          await tx.update(promise)
            .set({ supersededById: promiseId })
            .where(and(eq(promise.orgId, input.orgId), eq(promise.id, row.id)));
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collections.promise.marked",
          subjectKind: "promise",
          subjectId: promiseId,
          payloadSnapshot: {
            memberId: input.memberId,
            loanId: source.loanId,
            cycleId: source.cycleId,
            promisedOn: input.promisedOn,
            supersededPromiseIds: openRows.map((row) => row.id),
          },
          reason: note,
          at: now,
          createdAt: now,
        });
      });

      return { promiseId };
    },
    async recordChaseAttempt(input) {
      const source = normalizePromiseSourceRef(input);
      const now = new Date();

      await withTenantTransaction(input.orgId, async (tx) => {
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "collections.chase.whatsapp_attempted",
          subjectKind: source.loanId ? "loan" : "contribution_cycle",
          subjectId: source.loanId ?? source.cycleId,
          payloadSnapshot: {
            memberId: input.memberId,
            loanId: source.loanId,
            cycleId: source.cycleId,
            channel: "whatsapp",
            messageTemplateId: "collections_chase_v1",
            message: input.message,
          },
          reason: null,
          at: now,
          createdAt: now,
        });
      });
    },
    async emitPromiseReminders(todayIso) {
      dateParts(todayIso);
      const openPromises = await db.select().from(promise)
        .where(and(eq(promise.status, "open"), lte(promise.promisedOn, todayIso)));
      let remindersEmitted = 0;

      for (const row of openPromises) {
        const emitted = await withTenantTransaction(row.orgId, async (tx) => {
          const now = new Date();
          const [reminder] = await tx.insert(promiseReminder).values({
            orgId: row.orgId,
            promiseId: row.id,
            reminderDate: todayIso,
            alertId: null,
            createdAt: now,
          }).onConflictDoNothing().returning();

          if (!reminder) {
            return false;
          }

          const alertId = randomUUID();
          await tx.insert(alert).values({
            id: alertId,
            orgId: row.orgId,
            alertKind: "promise_due",
            severity: "medium",
            audience: "treasurer",
            subjectKind: row.loanId ? "loan" : "contribution_cycle",
            subjectId: row.loanId ?? row.cycleId,
            payload: { promiseId: row.id, memberId: row.memberId, promisedOn: row.promisedOn },
            dedupWindowEnd: new Date(now.getTime() + 86_400_000),
            dismissedAt: null,
            dismissedBy: null,
            snoozedUntil: null,
            createdAt: now,
          });
          await tx.update(promiseReminder)
            .set({ alertId })
            .where(and(
              eq(promiseReminder.orgId, row.orgId),
              eq(promiseReminder.id, reminder.id),
            ));
          await tx.insert(auditLogEntry).values({
            orgId: row.orgId,
            actorKind: "system",
            actorId: systemActorId(),
            actionKind: "collections.promise.reminder_emitted",
            subjectKind: "promise",
            subjectId: row.id,
            payloadSnapshot: { promiseId: row.id, alertId, reminderDate: todayIso },
            reason: null,
            at: now,
            createdAt: now,
          });
          return true;
        });
        if (emitted) {
          remindersEmitted += 1;
        }
      }

      return { promisesScanned: openPromises.length, remindersEmitted };
    },
  };
}
