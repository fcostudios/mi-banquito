import Link from "next/link";
import { Bell, Building2, Calendar, ListChecks, Plus, TrendingUp, Users } from "lucide-react";
import { createLedgerService, createMovementService } from "@mi-banquito/domain";
import { StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { MemberSearch } from "./member-search";

export const dynamic = "force-dynamic";

const copy = messages.sprint1.dashboard;

const actionTiles = [
  { href: "/aportes/registrar", title: copy.actions.contribution, description: copy.actions.contributionHint, icon: Plus },
  { href: "/cuota-base/registrar", title: copy.actions.quota, description: copy.actions.quotaHint, icon: Calendar },
  { href: "/socias/nueva", title: copy.actions.member, description: copy.actions.memberHint, icon: Users },
  { href: "/historial", title: copy.actions.history, description: copy.actions.historyHint, icon: ListChecks },
] as const;

function stateLabel(state: string) {
  if (state === "al_dia") return copy.states.alDia;
  if (state === "al_día") return copy.states.alDia;
  if (state === "parcial") return copy.states.parcial;
  if (state === "atrasado") return copy.states.atrasado;
  return copy.states.enMora;
}

export default async function ScrTreasurerHomePage() {
  const session = await requireTreasurer();
  const ledger = createLedgerService();
  const [rows, memberSearchRows, pendingDeposits] = await Promise.all([
    ledger.listComplianceRows(session.orgId),
    ledger.searchMembersWithBalance(session.orgId),
    createMovementService().listPendingDeposits(session.orgId),
  ]);
  const summary = rows.reduce(
    (acc, row) => {
      if (row.state === "al_dia" || row.state === "al_día") acc.current += 1;
      else if (row.state === "atrasado") acc.late += 1;
      else acc.mora += 1;
      return acc;
    },
    { current: 0, late: 0, mora: 0 },
  );
  const attentionRows = rows.filter((row) => row.state !== "al_dia" && row.state !== "al_día");
  const visibleRows = attentionRows.length > 0 ? attentionRows.slice(0, 5) : rows.slice(0, 5);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-treasurer-home">
      <section className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">{copy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-text-secondary">{copy.description}</p>
        </div>
        <Link
          href="/aportes/registrar"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 font-semibold text-text-on-primary"
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span>{copy.primaryCta}</span>
        </Link>
      </section>

      <section className="grid gap-3 md:grid-cols-4" aria-label={copy.actionsLabel}>
        {actionTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.href} href={tile.href} className="grid min-h-36 gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-primary">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-text-on-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-base font-semibold text-text-primary">{tile.title}</span>
              <span className="text-sm text-text-secondary">{tile.description}</span>
            </Link>
          );
        })}
      </section>

      <MemberSearch
        rows={memberSearchRows.map((row) => ({
          memberId: row.memberId,
          displayName: row.displayName,
          currentBalance: String(row.currentBalance),
        }))}
        labels={{
          title: copy.memberSearchTitle,
          search: copy.memberSearchLabel,
          empty: copy.memberSearchEmpty,
        }}
      />

      <section className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{copy.complianceTitle}</h2>
              <p className="text-sm text-text-secondary">{copy.complianceDescription}</p>
            </div>
            <Link href="/socias" className="text-sm font-semibold text-primary">{copy.viewMembers}</Link>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-md bg-surface-muted p-4">
              <p className="text-sm text-text-secondary">{copy.current}</p>
              <p className="mt-1 text-3xl font-bold text-text-primary">{summary.current}</p>
            </div>
            <div className="rounded-md bg-surface-muted p-4">
              <p className="text-sm text-text-secondary">{copy.late}</p>
              <p className="mt-1 text-3xl font-bold text-text-primary">{summary.late}</p>
            </div>
            <div className="rounded-md bg-surface-muted p-4">
              <p className="text-sm text-text-secondary">{copy.mora}</p>
              <p className="mt-1 text-3xl font-bold text-text-primary">{summary.mora}</p>
            </div>
          </div>
          <div className="grid border-t border-border">
            {visibleRows.length === 0 ? (
              <p className="p-4 text-sm text-text-secondary">{copy.empty}</p>
            ) : visibleRows.map((row) => (
              <Link key={row.memberId} href={`/socias/${row.memberId}`} className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-4 last:border-b-0">
                <span className="min-w-0 truncate font-medium text-text-primary">{row.displayName}</span>
                <StatusPill tone={row.tone} label={stateLabel(row.state)} />
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <Link href="/movimientos/registrar" className="grid gap-3 rounded-md border border-border bg-surface p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-muted text-primary">
              <Bell className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm text-text-secondary">{copy.pendingRegularization}</span>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-3xl text-text-primary">{pendingDeposits.length}</strong>
              <StatusPill tone={pendingDeposits.length > 0 ? "warning" : "success"} label={pendingDeposits.length > 0 ? copy.pendingStatus : copy.regularizedStatus} />
            </div>
            <span className="text-sm text-text-secondary">{copy.pendingRegularizationHint}</span>
          </Link>
          <Link href="/cuentas" className="grid gap-3 rounded-md border border-border bg-surface p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-muted text-primary">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm text-text-secondary">{copy.accounts}</span>
            <strong className="text-xl text-text-primary">{copy.accountsValue}</strong>
          </Link>
          <Link href="/liquidez" className="grid gap-3 rounded-md border border-border bg-surface p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-muted text-primary">
              <TrendingUp className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm text-text-secondary">{copy.liquidity}</span>
            <strong className="text-xl text-text-primary">{copy.liquidityValue}</strong>
          </Link>
        </div>
      </section>
    </main>
  );
}
