import { desc, eq } from "drizzle-orm";

import { db } from "@mi-banquito/db";
import { auditLogEntry, pilotLogEntry } from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export type PilotChecklistInput = {
  observedOn: string;
  cleanMonth: boolean;
  wouldNotReturnToPaper: boolean;
};

export type PilotExitChecklist = {
  hasThreeCleanMonths: boolean;
  hasWouldNotReturnAffirmation: boolean;
  readyToExit: boolean;
};

export type PilotLogEntry = {
  id: string;
  orgId: string;
  observedOn: string;
  vocabularyAnswer: string;
  paperValue: string;
  systemValue: string;
  discrepancy: string;
  wouldNotReturnToPaper: boolean;
  cleanMonth: boolean;
  note: string | null;
  loggedBy: string;
  createdAt: Date;
};

export type AddPilotLogEntryInput = {
  orgId: string;
  actorId: string;
  observedOn: string;
  vocabularyAnswer: string;
  paperValue: string;
  systemValue: string;
  discrepancy: string;
  wouldNotReturnToPaper: boolean;
  cleanMonth: boolean;
  note?: string | null;
};

function dateColumnToString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizePilotRow(row: typeof pilotLogEntry.$inferSelect): PilotLogEntry {
  return {
    ...row,
    observedOn: dateColumnToString(row.observedOn),
    note: row.note ?? null,
  };
}

export function evaluatePilotExitChecklist(rows: PilotChecklistInput[]): PilotExitChecklist {
  const sorted = [...rows].sort((left, right) => left.observedOn.localeCompare(right.observedOn));
  let streak = 0;
  let maxStreak = 0;

  for (const row of sorted) {
    streak = row.cleanMonth ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }

  const hasThreeCleanMonths = maxStreak >= 3;
  const hasWouldNotReturnAffirmation = sorted.some((row) => row.wouldNotReturnToPaper);

  return {
    hasThreeCleanMonths,
    hasWouldNotReturnAffirmation,
    readyToExit: hasThreeCleanMonths && hasWouldNotReturnAffirmation,
  };
}

export function createPilotService() {
  return {
    async listEntries(orgId: string): Promise<PilotLogEntry[]> {
      const rows = await withTenantTransaction(orgId, (tx) => tx.select().from(pilotLogEntry)
        .where(eq(pilotLogEntry.orgId, orgId))
        .orderBy(desc(pilotLogEntry.observedOn)));
      return rows.map(normalizePilotRow);
    },
    async addEntry(input: AddPilotLogEntryInput): Promise<PilotLogEntry> {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const now = new Date();
        const [row] = await tx.insert(pilotLogEntry).values({
        orgId: input.orgId,
        observedOn: input.observedOn,
        vocabularyAnswer: input.vocabularyAnswer,
        paperValue: input.paperValue,
        systemValue: input.systemValue,
        discrepancy: input.discrepancy,
        wouldNotReturnToPaper: input.wouldNotReturnToPaper,
        cleanMonth: input.cleanMonth,
        note: input.note?.trim() || null,
        loggedBy: input.actorId,
        createdAt: now,
      }).returning();

        if (!row) {
          throw new Error("pilot_log_entry_not_created");
        }

        await tx.insert(auditLogEntry).values({
        orgId: input.orgId,
        actorKind: "platform_operator",
        actorId: input.actorId,
        actionKind: "pilot_log.entry_created",
        subjectKind: "pilot_log_entry",
        subjectId: row.id,
        payloadSnapshot: input,
        reason: null,
        at: now,
        createdAt: now,
      });

        return normalizePilotRow(row);
      });
    },
  };
}
