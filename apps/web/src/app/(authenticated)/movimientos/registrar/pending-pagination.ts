import type {
  PendingDeposit,
  PendingDepositCursor,
  PendingDepositKey,
  RegularizableKind,
} from "@mi-banquito/domain";

export type SearchValue = string | string[] | undefined;

const regularizableKinds = new Set<RegularizableKind>([
  "contribution",
  "repayment",
  "extraordinary_collection",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const preservedSearchKeys = [
  "error",
  "saved",
  "category",
  "currency",
  "amount",
  "regularizesKind",
  "regularizesId",
  "pendingDate",
  "pendingKind",
  "pendingId",
] as const;

function scalar(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRegularizableKind(value: string | undefined): value is RegularizableKind {
  return value !== undefined && regularizableKinds.has(value as RegularizableKind);
}

function isCalendarDate(value: string | undefined): value is string {
  if (!value || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parsePendingCursor(search: Record<string, SearchValue>): PendingDepositCursor | null {
  const datedOn = scalar(search.pendingDate);
  const sourceKind = scalar(search.pendingKind);
  const id = scalar(search.pendingId);
  if (!isCalendarDate(datedOn) || !isRegularizableKind(sourceKind) || !id || !uuidPattern.test(id)) {
    return null;
  }
  return { datedOn, sourceKind, id };
}

export function parsePendingSelection(search: Record<string, SearchValue>): PendingDepositKey | null {
  const sourceKind = scalar(search.regularizesKind);
  const id = scalar(search.regularizesId);
  if (!isRegularizableKind(sourceKind) || !id || !uuidPattern.test(id)) return null;
  return { sourceKind, id };
}

export function pendingMovementHref(
  search: Record<string, SearchValue>,
  updates: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const key of preservedSearchKeys) {
    const value = scalar(search[key]);
    if (value !== undefined) params.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `/movimientos/registrar?${query}` : "/movimientos/registrar";
}

export function mergePendingRows(
  pageRows: PendingDeposit[],
  selected: PendingDeposit | null,
): PendingDeposit[] {
  if (!selected || pageRows.some((row) => row.sourceKind === selected.sourceKind && row.id === selected.id)) {
    return pageRows;
  }
  return [selected, ...pageRows];
}
