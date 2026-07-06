import Link from "next/link";
import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint1.members;
const dashboardCopy = messages.sprint1.dashboard;

function stateLabel(state: string) {
  if (state === "al_dia" || state === "al_día") return dashboardCopy.states.alDia;
  if (state === "parcial") return dashboardCopy.states.parcial;
  if (state === "atrasado") return dashboardCopy.states.atrasado;
  return dashboardCopy.states.enMora;
}

export default async function MemberListPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string; q?: string }>;
}) {
  const session = await requireTreasurer();
  const rows = await createLedgerService().listMembersWithCompliance(session.orgId);
  const { nueva, q } = await searchParams;
  const searchQuery = String(q ?? "").trim();
  const normalizedSearchQuery = searchQuery.toLocaleLowerCase("es-EC");
  const visibleRows = normalizedSearchQuery
    ? rows.filter((row) => row.displayName.toLocaleLowerCase("es-EC").includes(normalizedSearchQuery))
    : rows;
  const activeCount = rows.filter((row) => row.status === "activo").length;
  const pausedCount = rows.filter((row) => row.status === "en_pausa").length;
  const inactiveCount = rows.filter((row) => row.status === "baja").length;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-members-list">
      <header className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-sm font-semibold text-primary">{copy.statusSummary}</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">{copy.title}</h1>
          <p className="mt-2 text-text-secondary">{dashboardCopy.complianceDescription}</p>
        </div>
        <Link href="/socias/nueva">
          <ButtonPrimary labelKey={copy.add} />
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={copy.statusSummary}>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.active}</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{activeCount}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.paused}</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{pausedCount}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.inactive}</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">{inactiveCount}</p>
        </div>
      </section>

      <form className="grid gap-3 rounded-md border border-border bg-surface p-4 md:grid-cols-[1fr_auto] md:items-end" action="/socias">
        <label className="grid gap-2 text-sm font-semibold text-text-primary" htmlFor="member-search">
          {copy.searchLabel}
          <input
            id="member-search"
            className="min-h-12 rounded-md border border-border bg-surface px-4 font-normal text-text-primary"
            name="q"
            placeholder={copy.searchPlaceholder}
            defaultValue={searchQuery}
            type="search"
          />
        </label>
        <ButtonPrimary type="submit">{copy.searchAction}</ButtonPrimary>
      </form>

      <section className="overflow-hidden rounded-md border border-border bg-surface" role="list" aria-label={copy.title}>
        {rows.length === 0 ? <p className="p-5 text-text-secondary">{copy.empty}</p> : null}
        {rows.length > 0 && visibleRows.length === 0 ? <p className="p-5 text-text-secondary">{copy.noSearchResults}</p> : null}
        {visibleRows.map((row) => {
          const highlighted = nueva === row.id;
          return (
            <Link
              key={row.id}
              href={`/socias/${row.id}`}
              role="listitem"
              className={`grid min-h-20 gap-3 border-b border-border p-4 text-text-primary last:border-b-0 md:grid-cols-[1fr_auto] md:items-center ${
                highlighted ? "bg-primary-soft" : "hover:bg-surface-muted"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="truncate text-lg">{row.displayName}</strong>
                  <StatusPill tone={row.complianceTone} label={stateLabel(row.complianceState)} />
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {[row.whatsappNumber, row.role, row.status].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-sm font-semibold text-primary">{copy.openDetail}</span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
