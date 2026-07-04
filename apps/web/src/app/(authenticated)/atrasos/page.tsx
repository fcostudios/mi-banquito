import { createCollectionsService, type CollectionsAgingReasonKind, type CollectionsAgingRow } from "@mi-banquito/domain";
import { FormField, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { AgingTable } from "./aging-table";

export const dynamic = "force-dynamic";

const copy = messages.atrasos;

type SearchValue = string | string[] | undefined;
type SortKey = "default" | "member" | "dueDate" | "amount";

function searchValue(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function reasonFilter(value: string): CollectionsAgingReasonKind | undefined {
  return value === "aporte" || value === "cuota" ? value : undefined;
}

function sortKey(value: string): SortKey {
  return value === "member" || value === "dueDate" || value === "amount" ? value : "default";
}

function dateValue(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value instanceof Date ? value.toISOString() : value;
}

function sortRows(rows: CollectionsAgingRow[], sort: SortKey): CollectionsAgingRow[] {
  if (sort === "default") {
    return rows;
  }

  return [...rows].sort((a, b) => {
    if (sort === "member") {
      return a.memberName.localeCompare(b.memberName, "es");
    }
    if (sort === "dueDate") {
      return dateValue(a.dueDate).localeCompare(dateValue(b.dueDate));
    }
    return Number(b.amountDue) - Number(a.amountDue);
  });
}

export default async function ScrArAgingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const query = await searchParams;
  const reason = reasonFilter(searchValue(query.reason));
  const sort = sortKey(searchValue(query.sort));
  const rows = sortRows(
    await createCollectionsService().listAgingRows(session.orgId, reason),
    sort,
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-ar-aging">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-text-secondary">{copy.description}</p>
      </header>

      <form
        method="get"
        className="grid gap-4 rounded-md border border-border bg-surface p-5 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-end"
        data-testid="filter_bar"
      >
        <FormField labelKey={copy.reason}>
          <Select name="reason" defaultValue={reason ?? ""}>
            <option value="">{copy.allReasons}</option>
            <option value="aporte">{copy.reasonAporte}</option>
            <option value="cuota">{copy.reasonCuota}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.sort}>
          <Select name="sort" defaultValue={sort}>
            <option value="default">{copy.sortDefault}</option>
            <option value="member">{copy.sortMember}</option>
            <option value="dueDate">{copy.sortDueDate}</option>
            <option value="amount">{copy.sortAmount}</option>
          </Select>
        </FormField>
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground"
        >
          {copy.filter}
        </button>
      </form>

      <AgingTable rows={rows} />
    </main>
  );
}
