import { ButtonDestructive, ButtonPrimary, FormField, InputNumber, InputText, StatusPill } from "@mi-banquito/ui";
import { mapComplianceStatusToTone, type MemberStatementPreview } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { ecDate } from "@/lib/format/es-ec";
import { ROUTE_SCR_MEMBER_DETAIL } from "@/lib/routes";
import { StatementPreview } from "../../estados/statement-preview";

type FormAction = (formData: FormData) => void | Promise<void>;

export type MemberDetailPageView = {
  member: { id: string; displayName: string; status: string; role: string; initialSavingsBalance: string };
  currentBalance: string;
  balanceShareUrl: string | null;
  deposits: Array<{
    id: string; sourceKind: "contribution" | "repayment"; datedOn: string; accountName: string | null;
    amount: string; reconciliationStatus: "pending" | "regularized";
  }>;
  periodCloseId: string | null;
  preview: MemberStatementPreview | null;
  archiveUri: string | null;
  archiveHash?: string | null;
  archiveGeneratedAt?: string | null;
  generated: boolean;
};

const copy = messages.sprint1;
const memberCopy = messages.sprint1.members;
const dashboardCopy = messages.sprint1.dashboard;

export function MemberDetailView({
  view,
  generateAction,
  transitionAction,
}: {
  view: MemberDetailPageView;
  generateAction: FormAction;
  transitionAction: FormAction;
}) {
  const row = view.member;
  const state = row.status === "activo" ? "al_dia" : "atrasado";
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <header className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">{memberCopy.detailTitle}</p>
          <h1 className="mt-2 truncate text-3xl font-bold text-text-primary">{row.displayName}</h1>
          <p className="mt-2 text-text-secondary">{memberCopy.preserve}</p>
        </div>
        <StatusPill tone={mapComplianceStatusToTone(state)} label={row.status === "activo" ? dashboardCopy.states.alDia : dashboardCopy.states.atrasado} />
      </header>
      <section className="grid gap-4 md:grid-cols-3" aria-label={memberCopy.memberInfo}>
        <div className="rounded-md border border-border bg-surface p-4"><p className="text-sm text-text-secondary">{copy.common.status}</p><p className="mt-1 text-xl font-semibold text-text-primary">{row.status}</p></div>
        <div className="rounded-md border border-border bg-surface p-4"><p className="text-sm text-text-secondary">{copy.common.role}</p><p className="mt-1 text-xl font-semibold text-text-primary">{row.role}</p></div>
        <div className="rounded-md border border-border bg-surface p-4"><p className="text-sm text-text-secondary">{copy.common.initialSavings}</p><p className="mt-1 text-xl font-semibold text-text-primary">{row.initialSavingsBalance}</p></div>
      </section>
      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={memberCopy.depositStatusTitle}>
        <h2 className="text-lg font-semibold text-text-primary">{memberCopy.depositStatusTitle}</h2>
        {view.deposits.length === 0 ? <p className="text-sm text-text-secondary">{memberCopy.noDeposits}</p> : view.deposits.map((deposit) => (
          <div className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_auto] sm:items-center" key={`${deposit.sourceKind}:${deposit.id}`}>
            <div><p className="font-medium text-text-primary">{deposit.sourceKind === "contribution" ? memberCopy.contributionDeposit : memberCopy.repaymentDeposit}</p><p className="text-sm text-text-secondary">{deposit.datedOn} · {deposit.accountName ?? memberCopy.legacyAccount}</p></div>
            <div className="flex items-center gap-3"><span className="font-semibold text-text-primary">USD {Number(deposit.amount).toFixed(2)}</span><StatusPill tone={deposit.reconciliationStatus === "pending" ? "warning" : "success"} label={deposit.reconciliationStatus === "pending" ? memberCopy.pendingStatus : memberCopy.regularizedStatus} /></div>
          </div>
        ))}
      </section>
      <section className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center" aria-label={memberCopy.currentBalance}>
        <div><p className="text-sm text-text-secondary">{memberCopy.currentBalance}</p><p className="mt-1 text-[28px] font-bold tabular-nums text-text-primary">USD {Number(view.currentBalance).toFixed(2)}</p></div>
        {view.balanceShareUrl ? <a className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-4 font-semibold text-text-on-primary" href={view.balanceShareUrl}>{memberCopy.shareBalance}</a> : null}
        {view.periodCloseId ? (
          <form action={generateAction}>
            <input type="hidden" name="periodCloseId" value={view.periodCloseId} />
            <input type="hidden" name="memberId" value={row.id} />
            <input type="hidden" name="returnTo" value={`${ROUTE_SCR_MEMBER_DETAIL.replace("[id]", row.id)}?estado=generado`} />
            <ButtonPrimary type="submit">{memberCopy.generateStatement}</ButtonPrimary>
          </form>
        ) : null}
        <div className="grid gap-2 md:col-span-2">{view.generated && view.archiveUri ? (
          <p className="rounded-md border border-primary bg-primary-soft p-3 text-sm font-semibold text-text-primary">{memberCopy.statementReady}</p>
        ) : null}</div>
      </section>
      {view.preview ? <StatementPreview
        preview={view.preview}
        archiveUri={view.archiveUri}
        archiveGeneratedAt={view.archiveGeneratedAt ?? null}
      /> : view.archiveUri && view.archiveHash ? (
        <section className="grid gap-2 rounded-md border border-border bg-surface p-5" data-testid="member_statement_archive_fallback">
          <p className="break-all text-xs text-text-secondary">
            {messages.statementArchive.archivedHash}: {view.archiveHash}
          </p>
          {view.archiveGeneratedAt ? (
            <p className="text-xs text-text-secondary">
              {messages.statementArchive.archivedGeneratedAt}: {ecDate.format(new Date(view.archiveGeneratedAt))}
            </p>
          ) : null}
          <a className="font-semibold text-primary underline-offset-4 hover:underline" href={view.archiveUri} target="_blank" rel="noreferrer">
            {messages.statementArchive.openPdf}
          </a>
        </section>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2" aria-label={memberCopy.statusActions}>
        <form action={transitionAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <input type="hidden" name="memberId" value={row.id} /><input type="hidden" name="nextStatus" value="en_pausa" />
          <div><h2 className="text-lg font-semibold text-text-primary">{memberCopy.pause}</h2><p className="mt-1 text-sm text-text-secondary">{memberCopy.preserve}</p></div>
          <FormField labelKey={copy.common.reason}><InputText labelKey={copy.common.reason} name="reason" required /></FormField>
          <ButtonPrimary type="submit" labelKey={memberCopy.pause} />
        </form>
        <form action={transitionAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <input type="hidden" name="memberId" value={row.id} /><input type="hidden" name="nextStatus" value="baja" />
          <div><h2 className="text-lg font-semibold text-text-primary">{memberCopy.deactivate}</h2><p className="mt-1 text-sm text-text-secondary">{memberCopy.preserve}</p></div>
          <FormField labelKey={copy.common.reason}><InputText labelKey={copy.common.reason} name="reason" required /></FormField>
          <FormField labelKey={memberCopy.refund}><InputNumber name="refundAmount" defaultValue={row.initialSavingsBalance} min="0" step="0.01" /></FormField>
          <ButtonDestructive type="submit" labelKey={memberCopy.deactivate} />
        </form>
      </section>
    </main>
  );
}
