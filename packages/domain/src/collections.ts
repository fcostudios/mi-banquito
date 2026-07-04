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

export type PromiseStatus = "open" | "kept" | "broken" | "closed";

export type PromiseReminderRow = {
  status: PromiseStatus | string;
  promisedOn: DateOnlyString;
};

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

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
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

export function buildChaseMessage(input: {
  member: string;
  obligationKind: ChaseObligationKind;
  period: string;
}): string {
  return `Hola ${input.member}, te comparto que tu ${input.obligationKind} de ${input.period} aún está pendiente. ¿Cuándo crees poder hacerlo? - Mi Banquito.`;
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
  const cutoff = today;
  return promises.filter((promise) => (
    promise.status === "open" && promise.promisedOn <= cutoff
  ));
}
