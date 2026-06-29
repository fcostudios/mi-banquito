import { createLedgerService, reversalSentence } from "@mi-banquito/domain";
import { ButtonDestructive, FormField, InputText } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { reverseContributionAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default async function ScrHistoryPage() {
  const session = await requireTreasurer();
  const rows = await createLedgerService().listContributions(session.orgId);

  return (
    <main className="flex w-full flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.contributions.historyTitle}</h1>
      <div className="grid gap-3">
        {rows.length === 0 ? <p className="text-text-secondary">{copy.contributions.empty}</p> : null}
        {rows.map((row) => (
          <article key={row.id} className="grid gap-3 rounded-md border border-border bg-surface p-4">
            <p className="font-medium text-text-primary">
              {reversalSentence({ memberName: row.memberName, amount: row.amount, datedOn: row.datedOn })}
            </p>
            <form action={reverseContributionAction} className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input type="hidden" name="contributionId" value={row.id} />
              <FormField labelKey={copy.common.reason}>
                <InputText labelKey={copy.common.reason} name="reason" required />
              </FormField>
              <div className="self-end">
                <ButtonDestructive type="submit" labelKey={copy.contributions.reverse} />
              </div>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
