import { ButtonPrimary, YearEndShareOutEditor } from "@mi-banquito/ui";
import { createShareOutService } from "@mi-banquito/domain";

import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { approveShareOutAction, overrideShareOutLineAction, runShareOutDraftAction } from "./actions";

export const dynamic = "force-dynamic";

const pageCopy = messages.pages.reparto;
const shareOutCopy = messages.yearEndShareOut;

export default async function ScrYearEndShareOutPage() {
  const session = await requireTreasurer();
  const year = new Date().getUTCFullYear();
  const shareOut = await createShareOutService().getLatestDraft({ orgId: session.orgId, year });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-screen="SCR-year-end-share-out">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{pageCopy.title}</h1>
        <p className="mt-2 text-text-secondary">{shareOutCopy.description}</p>
      </header>

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
      ) : (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
          {shareOutCopy.empty.replace("{{year}}", String(year))}
        </p>
      )}
    </main>
  );
}
