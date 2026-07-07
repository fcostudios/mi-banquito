import { ButtonPrimary, YearEndShareOutEditor } from "@mi-banquito/ui";
import { createShareOutService, isShareOutReversalEligibleForView } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { approveShareOutAction, overrideShareOutLineAction, reverseShareOutAction, runShareOutDraftAction } from "./actions";

export const dynamic = "force-dynamic";

const pageCopy = messages.pages.reparto;
const shareOutCopy = messages.yearEndShareOut;

function shareOutErrorMessage(error?: string) {
  if (error === "governance-required") return shareOutCopy.governanceRequiredError;
  if (error === "year-end-close-required") return shareOutCopy.yearEndCloseRequiredError;
  if (error === "draft-failed") return shareOutCopy.genericError;
  if (error === "reversal-window-closed") return shareOutCopy.reversalWindowClosedError;
  if (error === "reversal-reason-min") return shareOutCopy.reversalReasonMinError;
  if (error === "reversal-not-allowed") return shareOutCopy.reversalNotAllowedError;
  if (error === "reversal-invalid-share-out") return shareOutCopy.reversalInvalidShareOutError;
  if (error === "reversal-failed") return shareOutCopy.reversalFailedError;
  return null;
}

function shareOutSuccessMessage(reversed?: string) {
  if (reversed === "1") return shareOutCopy.reversalSuccess;
  if (reversed === "already") return shareOutCopy.reversalAlreadyDone;
  return null;
}

export default async function ScrYearEndShareOutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reversed?: string }>;
}) {
  const session = await requireTreasurer();
  const year = new Date().getUTCFullYear();
  const { error, reversed } = await searchParams;
  const errorMessage = shareOutErrorMessage(error);
  const successMessage = shareOutSuccessMessage(reversed);
  const shareOut = await createShareOutService().getLatestDraft({ orgId: session.orgId, year });
  const showReversalPanel = shareOut ? isShareOutReversalEligibleForView({
    status: shareOut.status,
    approvedAt: shareOut.approvedAt,
    now: new Date(),
    graceDays: 10,
    lines: shareOut.lines.map((line) => ({
      finalShareAmount: line.finalShareAmount,
      withdrawalId: line.withdrawalId,
    })),
  }) : false;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-year-end-share-out">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{pageCopy.title}</h1>
        <p className="mt-2 text-text-secondary">{shareOutCopy.description}</p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm font-semibold text-text-primary">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm font-semibold text-text-primary">
          {successMessage}
        </p>
      ) : null}

      <form action={runShareOutDraftAction} className="rounded-md border border-border bg-surface p-5">
        <input type="hidden" name="year" value={year} />
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{shareOutCopy.governanceTitle}</h2>
            <p className="mt-1 text-sm text-text-secondary">{shareOutCopy.governanceDescription}</p>
          </div>
          <ButtonPrimary type="submit">{shareOutCopy.calculate.replace("{{year}}", String(year))}</ButtonPrimary>
        </div>
      </form>

      {shareOut ? (
        <>
          <YearEndShareOutEditor
            shareOut={{
              id: shareOut.id,
              year: shareOut.year,
              status: shareOut.status,
              repartoTotal: shareOut.repartoTotal,
              loanPoolAmount: shareOut.loanPoolAmount,
              savingsPoolAmount: shareOut.savingsPoolAmount,
              ajusteAmount: shareOut.ajusteAmount,
            }}
            lines={shareOut.lines}
            labels={{
              year: shareOutCopy.year,
              total: shareOutCopy.total,
              loanPool: shareOutCopy.loanPool,
              adjustment: shareOutCopy.adjustment,
              member: shareOutCopy.member,
              savings: shareOutCopy.savings,
              loanActivity: shareOutCopy.loanActivity,
              draft: shareOutCopy.draft,
              final: shareOutCopy.final,
              override: shareOutCopy.override,
              saveOverride: shareOutCopy.saveOverride,
              approve: shareOutCopy.approve,
              reasonPlaceholder: shareOutCopy.reason,
              finalAmountForMember: (memberName) => shareOutCopy.finalAmountForMember.replace("{{member}}", memberName),
              reasonForMember: (memberName) => shareOutCopy.reasonForMember.replace("{{member}}", memberName),
            }}
            overrideAction={overrideShareOutLineAction}
            approveAction={approveShareOutAction}
            approveControl={(
              <details open className="rounded-md border border-border bg-background p-4">
                <summary className="cursor-pointer font-semibold text-text-primary">{shareOutCopy.approveConfirmTitle}</summary>
                <form action={approveShareOutAction} className="mt-4 grid gap-3">
                  <input type="hidden" name="shareOutId" value={shareOut.id} />
                  <p className="text-sm text-text-secondary">{shareOutCopy.approveConfirmText}</p>
                  <label className="flex items-start gap-2 text-sm text-text-primary">
                    <input className="mt-1" type="checkbox" name="confirmApproval" value="yes" required />
                    <span>{shareOutCopy.approveConfirmCheckbox}</span>
                  </label>
                  <ButtonPrimary type="submit">{shareOutCopy.approve}</ButtonPrimary>
                </form>
              </details>
            )}
          />

          {showReversalPanel ? (
            <section className="rounded-md border border-border bg-surface p-5 text-text-primary">
              <div className="grid gap-1">
                <h2 className="text-lg font-semibold">{shareOutCopy.reverseTitle}</h2>
                <p className="text-sm text-text-secondary">{shareOutCopy.reverseDescription}</p>
              </div>
              <form action={reverseShareOutAction} className="mt-4 grid gap-3">
                <input type="hidden" name="shareOutId" value={shareOut.id} />
                <label className="grid gap-2 text-sm font-medium" htmlFor="share-out-reversal-reason">
                  {shareOutCopy.reverseReason}
                  <textarea
                    id="share-out-reversal-reason"
                    className="min-h-24 rounded-md border border-border bg-surface px-3 py-2 text-base font-normal"
                    name="reason"
                    minLength={10}
                    required
                  />
                </label>
                <div>
                  <ButtonPrimary type="submit">{shareOutCopy.reverseSubmit}</ButtonPrimary>
                </div>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
          {shareOutCopy.empty.replace("{{year}}", String(year))}
        </p>
      )}
    </main>
  );
}
