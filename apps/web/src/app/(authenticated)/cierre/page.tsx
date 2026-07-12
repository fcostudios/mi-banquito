import Link from "next/link";
import { createReconciliationService, type ReconciliationSnapshot } from "@mi-banquito/domain";
import { ButtonPrimary, ButtonSecondary, FormField, InputNumber, StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import {
  annotateReconciliationAction,
  closePeriodAction,
  executeReconciliationAction,
  shareMonthlyCloseAction,
} from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.monthlyClose;

function money(value: string) {
  return ecCurrency.format(Number(value));
}

function statusLabel(status: ReconciliationSnapshot["status"]) {
  if (status === "closed") {
    return copy.statusClosed;
  }
  if (status === "annotated") {
    return copy.statusAnnotated;
  }
  if (status === "outside_tolerance") {
    return copy.statusOutside;
  }
  return copy.statusWithin;
}

function resultMessage(params?: { reconciled?: string; annotated?: string; closed?: string; error?: string }) {
  if (params?.error) {
    return decodeURIComponent(params.error) || copy.error;
  }
  if (params?.closed) {
    return copy.successClosed;
  }
  if (params?.annotated) {
    return copy.successAnnotated;
  }
  if (params?.reconciled) {
    return copy.successReconciled;
  }
  return null;
}

export default async function ScrMonthlyClosePage({
  searchParams,
}: {
  searchParams?: Promise<{ reconciled?: string; annotated?: string; closed?: string; error?: string }>;
}) {
  const session = await requireTreasurer();
  const state = await createReconciliationService().getMonthlyCloseState(session.orgId);
  const params = await searchParams;
  const message = resultMessage(params);
  const hasPendingRegularizations = state.pendingRegularizations.length > 0;
  const canClose = Boolean(state.id) && state.closeAllowed && !hasPendingRegularizations;
  const canAnnotate = Boolean(state.id) && state.status === "outside_tolerance";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6" data-screen="SCR-monthly-close">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-text-secondary">{copy.description}</p>
      </div>

      {message ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm font-semibold text-text-primary">{message}</p>
      ) : null}

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.title}>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-sm text-text-secondary">{copy.cycle}</p>
            <p className="font-semibold text-text-primary">{state.cycleLabel}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">{copy.computedPool}</p>
            <p className="font-semibold text-text-primary">{money(state.computedPoolBalance)}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">{copy.discrepancy}</p>
            <p className="font-semibold text-text-primary">{money(state.discrepancyAmount)}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">{copy.tolerance}</p>
            <p className="font-semibold text-text-primary">{money(state.toleranceAmount)}</p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-sm text-text-secondary">{statusLabel(state.status)}</p>
          {state.resolutionNote ? (
            <p className="mt-2 text-sm text-text-primary">{state.resolutionNote}</p>
          ) : null}
        </div>

        <form action={executeReconciliationAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <input type="hidden" name="cycleId" value={state.cycleId} />
          <FormField labelKey={copy.declaredBalance}>
            <InputNumber
              name="declaredBankBalance"
              min="0"
              step="0.01"
              defaultValue={Number(state.declaredBankBalance)}
              aria-label={copy.declaredBalance}
              required
            />
          </FormField>
          <ButtonPrimary type="submit">{copy.reconcile}</ButtonPrimary>
        </form>
      </section>

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.pendingTitle}>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{copy.pendingTitle}</h2>
          <p className="text-sm text-text-secondary">{copy.pendingDescription}</p>
        </div>
        {state.pendingRegularizations.length === 0 ? (
          <p className="text-sm font-semibold text-success">{copy.pendingEmpty}</p>
        ) : (
          <div className="grid gap-3">
            {state.pendingRegularizations.map((row) => (
              <div className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={`${row.kind}:${row.id}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{row.memberName}</p>
                  <p className="text-sm text-text-secondary">{row.datedOn} · {row.accountName ?? copy.legacyAccount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">USD {Number(row.amount).toFixed(2)}</span>
                  <StatusPill tone="warning" label={copy.pendingStatus} />
                </div>
                <Link className="inline-flex min-h-12 items-center justify-center font-semibold text-primary" href={`/movimientos/registrar?regularizesKind=${row.kind}&regularizesId=${row.id}`}>
                  {copy.regularize}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.annotationTitle}>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{copy.annotationTitle}</h2>
          <p className="text-sm text-text-secondary">{copy.annotationHelp}</p>
        </div>
        <form action={annotateReconciliationAction} className="grid gap-3">
          <input type="hidden" name="reconciliationCycleId" value={state.id} />
          <FormField labelKey={copy.reason}>
            <textarea
              name="reason"
              className="min-h-24 w-full rounded-md border border-border bg-surface px-4 py-3 text-text-primary focus:border-primary"
              defaultValue={state.resolutionNote ?? ""}
              disabled={!canAnnotate}
              required
            />
          </FormField>
          <ButtonSecondary type="submit" disabled={!canAnnotate}>{copy.annotate}</ButtonSecondary>
        </form>
        <form action={closePeriodAction} className="flex flex-wrap gap-3">
          <input type="hidden" name="reconciliationCycleId" value={state.id} />
          <ButtonPrimary type="submit" disabled={!canClose}>{copy.close}</ButtonPrimary>
          {!canClose && state.status !== "closed" ? (
            <p className="text-sm text-text-secondary">{hasPendingRegularizations ? copy.pendingCloseDisabled : copy.closeDisabled}</p>
          ) : null}
        </form>
      </section>

      {state.monthlyCloseStatementId && state.monthlyClosePdfUri ? (
        <section className="grid gap-4 rounded-md border border-border bg-surface p-5" aria-label={copy.archiveTitle}>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{copy.archiveTitle}</h2>
            {state.canonicalPayloadHash ? (
              <p className="break-all text-sm text-text-secondary">{copy.hash}: {state.canonicalPayloadHash}</p>
            ) : null}
          </div>
          {state.monthlyCloseArtifactStatus === "ready" ? (
            <div className="flex flex-wrap gap-3">
              <Link href={state.monthlyClosePdfUri} className="inline-flex min-h-12 items-center rounded-md border border-primary bg-surface px-4 text-primary">
                {copy.previewPdf}
              </Link>
              <form action={shareMonthlyCloseAction}>
                <input type="hidden" name="statementArchiveId" value={state.monthlyCloseStatementId} />
                <ButtonPrimary type="submit">{copy.shareWhatsApp}</ButtonPrimary>
              </form>
            </div>
          ) : <p className="text-sm font-semibold text-text-secondary">{copy.artifactProcessing}</p>}
        </section>
      ) : null}
    </main>
  );
}
