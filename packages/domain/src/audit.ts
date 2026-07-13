import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { auditLogEntry, member } from "@mi-banquito/db/schema";
import { withTenantTransaction } from "@mi-banquito/db/tenant";

export type AuditRow = typeof auditLogEntry.$inferSelect;

export type AuditNarrationInput = Pick<
  AuditRow,
  | "id"
  | "orgId"
  | "actorKind"
  | "actorId"
  | "actionKind"
  | "subjectKind"
  | "subjectId"
  | "payloadSnapshot"
  | "reason"
  | "at"
  | "createdAt"
>;

export type AuditFilterableRow = {
  id: string;
  orgId?: string | null;
  memberId?: string | null;
  actionKind: string;
  at: Date | string;
};

export type AuditFilters = {
  memberId?: string;
  actionKind?: string;
  from?: string;
  to?: string;
};

export type AuditNarratedEntry = {
  id: string;
  orgId: string | null;
  actorKind: string;
  actorId: string;
  actionKind: string;
  subjectKind: string;
  subjectId: string | null;
  memberId: string | null;
  at: Date;
  text: string;
  details: AuditNarratedDetail[];
};

export type AuditNarratedDetail = {
  label: string;
  value: string;
};

export type AuditPdfPayload = {
  generatedAt: string;
  entries: Array<{
    at: string;
    actionKind: string;
    actorKind: string;
    text: string;
  }>;
};

export interface AuditService {
  readonly context: "audit";
  listNarratedEntries(filters: AuditFilters & { orgId: string }): Promise<AuditNarratedEntry[]>;
}

export class AuditWriteFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteFailure";
  }
}

export type AuditWriter<Entry, Tx> = (input: { tx: Tx; entry: Entry }) => Promise<unknown>;

export interface WriteWithAuditInput<T> {
  write: () => Promise<T>;
  audit: (result: T) => Promise<unknown>;
}

type PayloadObject = Record<string, unknown>;

function payloadObject(value: unknown): PayloadObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PayloadObject : {};
}

function stringField(payload: PayloadObject, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function dateOnly(value: Date | string): string {
  return dateValue(value).toISOString().slice(0, 10);
}

function money(value: string | number | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

function moneyValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value).toFixed(2);
  }
  return undefined;
}

function memberName(payload: PayloadObject): string {
  return stringField(payload, "memberName")
    ?? stringField(payload, "borrowerName")
    ?? stringField(payload, "displayName")
    ?? "Una socia";
}

function memberIdFromPayload(payload: PayloadObject): string | undefined {
  return stringField(payload, "memberId")
    ?? stringField(payload, "borrowerMemberId")
    ?? stringField(payload, "subjectMemberId");
}

function paymentSourceLabel(value: string | undefined): string | undefined {
  if (value === "cash_in_meeting") {
    return "Efectivo en reunión";
  }
  if (value === "bank_transfer") {
    return "Transferencia bancaria";
  }
  if (value === "petty_cash_deposit") {
    return "Depósito de caja chica";
  }
  return value;
}

function detail(label: string, value: string | undefined): AuditNarratedDetail[] {
  return value ? [{ label, value }] : [];
}

function periodFromNote(value: string | undefined): string | undefined {
  return value?.match(/\b\d{4}-\d{2}\b/)?.[0];
}

function contributionDetails(payload: PayloadObject): AuditNarratedDetail[] {
  const notes = stringField(payload, "notes");
  return [
    ...detail("Nota", notes),
    ...detail("Aplicado a", stringField(payload, "cycleLabel") ?? periodFromNote(notes)),
    ...detail("Fuente", paymentSourceLabel(stringField(payload, "paymentSource"))),
  ];
}

function extraDecisionLabel(value: string | undefined): string | undefined {
  if (value === "extra_savings") return "Aporte extra / ahorro";
  if (value === "future_contribution") return "Prepagar aporte futuro";
  if (value === "loan_principal") return "Abonar a capital";
  return value;
}

function allocationKindLabel(value: string | undefined, payload: PayloadObject): string {
  if (value === "loan_fee") return "Aplicado a mora/comisión";
  if (value === "loan_interest") return "Aplicado a interés";
  if (value === "loan_principal") return "Aplicado a capital";
  if (value === "contribution_overdue" || value === "contribution_current" || value === "contribution_future") {
    return `Aporte ${stringField(payload, "cycleLabel") ?? stringField(payload, "cycleId") ?? ""}`.trim();
  }
  if (value === "extra_savings") return "Aporte extra / ahorro";
  return "Aplicación";
}

function allocationDetails(payload: PayloadObject): AuditNarratedDetail[] {
  const allocations = payload.allocations;
  if (!Array.isArray(allocations)) {
    return [];
  }
  return allocations
    .filter((entry): entry is PayloadObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .flatMap((entry) => {
      const amount = moneyValue(entry.amount);
      if (!amount) {
        return [];
      }
      return [{
        label: allocationKindLabel(stringField(entry, "kind"), entry),
        value: `$${amount}`,
      }];
    });
}

function receiptDetails(payload: PayloadObject): AuditNarratedDetail[] {
  return [
    ...detail("Decisión extra", extraDecisionLabel(stringField(payload, "extraDecision"))),
    ...allocationDetails(payload),
  ];
}

function auditDetails(input: AuditNarrationInput): AuditNarratedDetail[] {
  const payload = payloadObject(input.payloadSnapshot);
  if (input.actionKind === "contribution.create") {
    return contributionDetails(payload);
  }
  if (input.actionKind === "payment.receipt.recorded") {
    return receiptDetails(payload);
  }
  if (input.actionKind === "contribution.reverse") {
    return [
      ...detail("Razón", stringField(payload, "reverseReason") ?? input.reason ?? undefined),
      ...detail("Aplicado a", stringField(payload, "cycleLabel")),
    ];
  }
  return [
    ...detail("Nota", stringField(payload, "notes")),
    ...detail("Razón", input.reason ?? undefined),
  ];
}

const templates: Record<string, (input: AuditNarrationInput) => string> = {
  "contribution.create": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} registró un aporte de $${money(stringField(payload, "amount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
  "contribution.reverse": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} reversó un aporte de $${money(stringField(payload, "amount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
  "loan.repayment.create": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} registró un pago de $${money(stringField(payload, "amount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
  "loan.repayment.payoff": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} terminó de pagar un préstamo con un pago de $${money(stringField(payload, "amount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
  "loan.repayment.data_correction": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `Se corrigió el registro de pago de ${memberName(payload)} por $${money(stringField(payload, "amount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
  "loan.originated": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} recibió un préstamo de $${money(stringField(payload, "principalAmount"))} el ${stringField(payload, "originatedOn") ?? dateOnly(input.at)}.`;
  },
  "member.create": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} fue registrada como socia el ${stringField(payload, "joinedOn") ?? dateOnly(input.at)}.`;
  },
  "member.status_transition": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} cambió de estado a ${stringField(payload, "status") ?? stringField(payload, "nextStatus") ?? "actualizado"} el ${dateOnly(input.at)}.`;
  },
  "group_config.version": (input) => `Se actualizaron las reglas del grupo el ${dateOnly(input.at)}.`,
  "business_rules.view": (input) => `Una operadora revisó las reglas del grupo el ${dateOnly(input.at)}.`,
  "adjustment_period.open": (input) => `Una operadora abrió una ventana de ajuste el ${dateOnly(input.at)}.`,
  "base_fund_quota.payment": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} registró una cuota base de $${money(stringField(payload, "amount"))} el ${stringField(payload, "paidOn") ?? dateOnly(input.at)}.`;
  },
  "payment.receipt.recorded": (input) => {
    const payload = payloadObject(input.payloadSnapshot);
    return `${memberName(payload)} registró un pago agrupado de $${money(stringField(payload, "receivedAmount"))} el ${stringField(payload, "datedOn") ?? dateOnly(input.at)}.`;
  },
};

export const narratedAuditActionKinds = Object.freeze(Object.keys(templates));

export function narrateAuditRow(input: AuditNarrationInput): string {
  return templates[input.actionKind]?.(input) ?? `Se registró ${input.actionKind} el ${dateOnly(input.at)}.`;
}

function matchesDateRange(rowDate: Date, filters: AuditFilters): boolean {
  const rowTime = rowDate.getTime();
  if (filters.from && rowTime < new Date(`${filters.from}T00:00:00.000Z`).getTime()) {
    return false;
  }
  if (filters.to && rowTime >= new Date(`${filters.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

export function filterAuditRows<T extends AuditFilterableRow>(input: {
  rows: T[];
  filters: AuditFilters;
}): T[] {
  const member = input.filters.memberId?.trim();
  const action = input.filters.actionKind?.trim();
  return input.rows.filter((row) => {
    const rowDate = dateValue(row.at);
    return (!member || row.memberId === member)
      && (!action || row.actionKind === action)
      && matchesDateRange(rowDate, input.filters);
  });
}

function narratedEntry(row: AuditRow, memberNames = new Map<string, string>()): AuditNarratedEntry {
  const payload = payloadObject(row.payloadSnapshot);
  const payloadMemberId = memberIdFromPayload(payload) ?? (row.subjectKind === "member" ? row.subjectId ?? undefined : undefined);
  const enrichedPayload = payloadMemberId && !stringField(payload, "memberName") && memberNames.has(payloadMemberId)
    ? { ...payload, memberName: memberNames.get(payloadMemberId) }
    : payload;
  const enrichedRow = enrichedPayload === payload ? row : { ...row, payloadSnapshot: enrichedPayload };
  return {
    id: row.id,
    orgId: row.orgId,
    actorKind: row.actorKind,
    actorId: row.actorId,
    actionKind: row.actionKind,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    memberId: payloadMemberId ?? null,
    at: dateValue(row.at),
    text: narrateAuditRow(enrichedRow),
    details: auditDetails(enrichedRow),
  };
}

async function memberNameMap(orgId: string, rows: AuditRow[]): Promise<Map<string, string>> {
  const memberIds = [...new Set(rows.flatMap((row) => {
    const payload = payloadObject(row.payloadSnapshot);
    if (stringField(payload, "memberName")) {
      return [];
    }
    const id = memberIdFromPayload(payload) ?? (row.subjectKind === "member" ? row.subjectId ?? undefined : undefined);
    return id ? [id] : [];
  }))];
  if (memberIds.length === 0) {
    return new Map();
  }
  const members = await withTenantTransaction(orgId, (tx) => tx.select({
    id: member.id,
    displayName: member.displayName,
  }).from(member)
    .where(and(eq(member.orgId, orgId), inArray(member.id, memberIds))));
  return new Map(members.map((row) => [row.id, row.displayName]));
}

export function buildAuditPdfPayload(entries: AuditNarratedEntry[]): AuditPdfPayload {
  return {
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      at: entry.at.toISOString(),
      actionKind: entry.actionKind,
      actorKind: entry.actorKind,
      text: entry.text,
    })),
  };
}

export const createAuditService = (): AuditService => ({
  context: "audit",
  async listNarratedEntries(filters) {
    const rows = await withTenantTransaction(filters.orgId, (tx) => tx.select().from(auditLogEntry)
      .where(and(eq(auditLogEntry.orgId, filters.orgId)))
      .orderBy(desc(auditLogEntry.at)));
    const names = await memberNameMap(filters.orgId, rows);
    return filterAuditRows({
      rows: rows.map((row) => narratedEntry(row, names)),
      filters,
    });
  },
});

export const createAuditFailure = (message: string): AuditWriteFailure => new AuditWriteFailure(message);

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return "audit write failed";
};

export const writeWithAudit = async <T>({ write, audit }: WriteWithAuditInput<T>): Promise<T> => {
  const result = await write();
  try {
    await audit(result);
  } catch (error) {
    if (error instanceof AuditWriteFailure) {
      throw error;
    }
    throw createAuditFailure(errorMessage(error));
  }
  return result;
};
