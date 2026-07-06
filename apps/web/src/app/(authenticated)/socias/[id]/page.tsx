import { notFound } from "next/navigation";
import { ButtonDestructive, ButtonPrimary, FormField, InputNumber, InputText, StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { createLedgerService, createReportingService, mapComplianceStatusToTone } from "@mi-banquito/domain";
import messages from "@/lib/i18n/en-US.json";
import { generateMemberStatementsAction } from "../../estados/actions";
import { transitionMemberStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;
const memberCopy = messages.sprint1.members;
const dashboardCopy = messages.sprint1.dashboard;

export default async function ScrMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ estado?: string }>;
}) {
  const session = await requireTreasurer();
  const { id } = await params;
  const { estado } = await (searchParams ?? Promise.resolve({} as { estado?: string }));
  const ledger = createLedgerService();
  const [row, balanceRow, archivedStatements] = await Promise.all([
    ledger.getMember(session.orgId, id),
    ledger.getMemberBalance(session.orgId, id),
    createReportingService().listStatementArchive(session.orgId),
  ]);
  if (!row) notFound();
  const state = row.status === "activo" ? "al_dia" : "atrasado";
  const currentBalance = balanceRow?.currentBalance ?? row.initialSavingsBalance;
  const latestPeriodClose = archivedStatements.find((statement) => statement.kind === "monthly_close" && statement.periodCloseId);
  const latestMemberStatement = archivedStatements.find((statement) =>
    statement.kind === "monthly_member"
    && statement.memberId === row.id
    && statement.pdfUri
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-member-detail">
      <header className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">{memberCopy.detailTitle}</p>
          <h1 className="mt-2 truncate text-3xl font-bold text-text-primary">{row.displayName}</h1>
          <p className="mt-2 text-text-secondary">{memberCopy.preserve}</p>
        </div>
        <StatusPill tone={mapComplianceStatusToTone(state)} label={row.status === "activo" ? dashboardCopy.states.alDia : dashboardCopy.states.atrasado} />
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label={memberCopy.memberInfo}>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.common.status}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{row.status}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.common.role}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{row.role}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">{copy.common.initialSavings}</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{row.initialSavingsBalance}</p>
        </div>
      </section>

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center" aria-label={memberCopy.currentBalance}>
        <div>
          <p className="text-sm text-text-secondary">{memberCopy.currentBalance}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-text-primary">USD {Number(currentBalance).toFixed(2)}</p>
        </div>
        {balanceRow?.balanceShareUrl ? (
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-4 font-semibold text-text-on-primary"
            href={balanceRow.balanceShareUrl}
          >
            {memberCopy.shareBalance}
          </a>
        ) : null}
        {latestPeriodClose?.periodCloseId ? (
          <form action={generateMemberStatementsAction}>
            <input type="hidden" name="periodCloseId" value={latestPeriodClose.periodCloseId} />
            <input type="hidden" name="memberId" value={row.id} />
            <input type="hidden" name="returnTo" value={`/socias/${row.id}?estado=generado`} />
            <ButtonPrimary type="submit">{memberCopy.generateStatement}</ButtonPrimary>
          </form>
        ) : null}
        <div className="grid gap-2 md:col-span-2">
          {estado === "generado" ? (
            <p className="rounded-md border border-primary bg-primary-soft p-3 text-sm font-semibold text-text-primary">
              {memberCopy.statementReady}
            </p>
          ) : null}
          {latestMemberStatement?.pdfUri ? (
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-primary bg-surface px-4 font-semibold text-primary"
              href={latestMemberStatement.pdfUri}
              target="_blank"
              rel="noreferrer"
            >
              {memberCopy.openStatement.replace("{{period}}", latestMemberStatement.periodLabel)}
            </a>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2" aria-label={memberCopy.statusActions}>
        <form action={transitionMemberStatusAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <input type="hidden" name="memberId" value={row.id} />
          <input type="hidden" name="nextStatus" value="en_pausa" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{memberCopy.pause}</h2>
            <p className="mt-1 text-sm text-text-secondary">{memberCopy.preserve}</p>
          </div>
          <FormField labelKey={copy.common.reason}>
            <InputText labelKey={copy.common.reason} name="reason" required />
          </FormField>
          <ButtonPrimary type="submit" labelKey={memberCopy.pause} />
        </form>

        <form action={transitionMemberStatusAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <input type="hidden" name="memberId" value={row.id} />
          <input type="hidden" name="nextStatus" value="baja" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{memberCopy.deactivate}</h2>
            <p className="mt-1 text-sm text-text-secondary">{memberCopy.preserve}</p>
          </div>
          <FormField labelKey={copy.common.reason}>
            <InputText labelKey={copy.common.reason} name="reason" required />
          </FormField>
          <FormField labelKey={memberCopy.refund}>
            <InputNumber name="refundAmount" defaultValue={row.initialSavingsBalance} min="0" step="0.01" />
          </FormField>
          <ButtonDestructive type="submit" labelKey={memberCopy.deactivate} />
        </form>
      </section>
    </main>
  );
}
