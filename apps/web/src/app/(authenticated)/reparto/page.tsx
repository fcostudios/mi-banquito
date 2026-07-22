import { randomUUID } from "node:crypto";
import { CircleCheck } from "lucide-react";
import { ButtonPrimary, formatRatioPercent, formatUsdMoney4, YearEndShareOutEditor } from "@mi-banquito/ui";
import { compareMoney4, createAlertsService, createShareOutService, isShareOutReversalEligibleForView } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { approveShareOutAction, overrideShareOutLineAction, reverseShareOutAction, runShareOutDraftAction } from "./actions";

export const dynamic = "force-dynamic";

const pageCopy = messages.pages.reparto;
const shareOutCopy = messages.yearEndShareOut;

function isActiveA5ForYear(row: Awaited<ReturnType<ReturnType<typeof createAlertsService>["listVisibleAlerts"]>>[number], year: number) {
  if (row.alertKind !== "A5" || (row.payload.year !== year && row.payload.year !== String(year))) return false;
  if (typeof row.payload.commitment !== "string" || typeof row.payload.projectedAvailable !== "string") return false;
  try {
    return compareMoney4(row.payload.commitment, row.payload.projectedAvailable) === 1;
  } catch {
    return false;
  }
}

function shareOutErrorMessage(error?: string) {
  if (error === "governance-required") return shareOutCopy.governanceRequiredError;
  if (error === "year-end-close-required") return shareOutCopy.yearEndCloseRequiredError;
  if (error === "draft-invalid") return shareOutCopy.draftInvalidError;
  if (error === "regularized-balance") return shareOutCopy.regularizedBalanceError;
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
  const [shareOut, visibleAlerts] = await Promise.all([
    createShareOutService().getLatestDraft({ orgId: session.orgId, year }),
    createAlertsService().listVisibleAlerts({ orgId: session.orgId, audience: "treasurer" }),
  ]);
  const activeA5Alert = visibleAlerts.find((row) => isActiveA5ForYear(row, year));
  const showReversalPanel = shareOut ? isShareOutReversalEligibleForView({
    status: shareOut.status,
    approvedAt: shareOut.approvedAt,
    now: new Date(),
    graceHours: 24,
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
        <p
          className="rounded-md border border-border bg-surface p-4 text-sm font-semibold text-text-primary"
          data-testid={error === "regularized-balance" ? "regularized_balance_gate" : undefined}
        >
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm font-semibold text-text-primary">
          {successMessage}
        </p>
      ) : null}

      <form action={runShareOutDraftAction} className="rounded-md border border-border bg-surface p-5" data-testid="step0_governance">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="clientRequestId" value={randomUUID()} />
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
          <section className="rounded-md border border-border bg-surface p-5" data-testid="step1_group_summary">
            <h2 className="text-lg font-semibold text-text-primary">{shareOutCopy.twoPoolTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-text-secondary">{shareOutCopy.loanPoolSummary}</p>
                <p className="text-xl font-bold text-text-primary">{formatUsdMoney4(shareOut.loanPoolAmount, "code")}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">{shareOutCopy.savingsPoolSummary}</p>
                <p className="text-xl font-bold text-text-primary">{formatUsdMoney4(shareOut.savingsPoolAmount, "code")}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">{shareOutCopy.loanRateSummary}</p>
                <p className="text-xl font-bold text-text-primary">{formatRatioPercent(shareOut.alicuotaPrestamos ?? "0.0000")}</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary">{shareOutCopy.savingsRateSummary}</p>
                <p className="text-xl font-bold text-text-primary">{formatRatioPercent(shareOut.alicuotaAhorros ?? "0.0000")}</p>
              </div>
            </div>
          </section>
          <div data-testid="step1_explanation">
            <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
              {shareOutCopy.participationExplanation}
            </p>
          </div>
          <section className="rounded-md border border-border bg-surface p-5" data-testid="regularized_balance">
            <p className="text-sm text-text-secondary">{shareOutCopy.regularizedBalance}</p>
            <p className="text-2xl font-bold text-text-primary">{formatUsdMoney4(shareOut.totalPoolAtRun ?? "0.0000", "code")}</p>
            <p className="mt-2 text-sm text-text-secondary">{shareOutCopy.regularizedBalanceExplanation}</p>
          </section>
          {activeA5Alert ? (
            <p className="rounded-md border border-warning-bg bg-warning-bg p-4 text-sm font-semibold text-warning-text" data-testid="step1_a5_gate">
              {activeA5Alert.body}
            </p>
          ) : null}
          <section className="rounded-md border border-success bg-surface p-4 text-sm text-text-secondary" data-testid="step3_summary">
            <div className="flex items-start gap-3">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <h2 className="font-semibold text-text-primary">{shareOutCopy.approvalSummaryTitle}</h2>
                <p className="mt-1">{shareOutCopy.approvalSummary}</p>
              </div>
            </div>
          </section>
          <div data-testid="step2_per_member_table">
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
                <details open className="rounded-md border border-border bg-background p-4" data-testid="step3_approve">
                <summary className="cursor-pointer font-semibold text-text-primary">{shareOutCopy.approveConfirmTitle}</summary>
                <form action={approveShareOutAction} className="mt-4 grid gap-3">
                  <input type="hidden" name="shareOutId" value={shareOut.id} />
                  <p className="text-sm text-text-secondary">{shareOutCopy.approveConfirmText}</p>
                  <label className="flex items-start gap-2 text-sm text-text-primary">
                    <input className="mt-1" type="checkbox" name="confirmApproval" value="yes" required />
                    <span>{shareOutCopy.approveConfirmCheckbox}</span>
                  </label>
                  <ButtonPrimary data-testid="btn_approve" type="submit">{shareOutCopy.approve}</ButtonPrimary>
                </form>
                </details>
              )}
            />
          </div>

          {showReversalPanel ? (
            <section className="rounded-md border border-border bg-surface p-5 text-text-primary" data-testid="step3_grace_window">
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
                  <ButtonPrimary data-testid="btn_reverse" type="submit">{shareOutCopy.reverseSubmit}</ButtonPrimary>
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
