import { createAuditService, narratedAuditActionKinds } from "@mi-banquito/domain";
import {
  ButtonPrimary,
  FormField,
  InputText,
  Select,
} from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecDateTime } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.history;

type SearchValue = string | string[] | undefined;

function searchValue(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function entryDate(value: Date) {
  return ecDateTime.format(value);
}

const actionLabels: Record<(typeof narratedAuditActionKinds)[number], string> = {
  "contribution.create": copy.actions.contributionCreate,
  "contribution.reverse": copy.actions.contributionReverse,
  "loan.repayment.create": copy.actions.repaymentCreate,
  "loan.repayment.payoff": copy.actions.repaymentPayoff,
  "loan.repayment.data_correction": copy.actions.repaymentDataCorrection,
  "loan.originated": copy.actions.loanOriginate,
  "member.create": copy.actions.memberCreate,
  "member.status_transition": copy.actions.memberStatus,
  "group_config.version": copy.actions.groupConfigVersion,
  "business_rules.view": copy.actions.businessRulesView,
  "adjustment_period.open": copy.actions.adjustmentPeriodOpen,
  "base_fund_quota.payment": copy.actions.baseFundQuotaPayment,
};

function actionLabel(actionKind: string) {
  return actionLabels[actionKind as keyof typeof actionLabels] ?? actionKind;
}

export default async function ScrHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const query = await searchParams;
  const memberId = searchValue(query.memberId);
  const actionKind = searchValue(query.actionKind);
  const from = searchValue(query.from);
  const to = searchValue(query.to);
  const entries = await createAuditService().listNarratedEntries({
    orgId: session.orgId,
    memberId,
    actionKind,
    from,
    to,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6" data-screen="SCR-history">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </header>

      <form method="get" className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-5">
        <FormField labelKey={copy.memberId}>
          <InputText
            labelKey={copy.memberId}
            name="memberId"
            defaultValue={memberId}
          />
        </FormField>
        <FormField labelKey={copy.actionKind}>
          <Select name="actionKind" defaultValue={actionKind}>
            <option value="">{copy.allActions}</option>
            {narratedAuditActionKinds.map((kind) => (
              <option key={kind} value={kind}>{actionLabels[kind]}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.from}>
          <InputText
            labelKey={copy.from}
            name="from"
            type="date"
            defaultValue={from}
          />
        </FormField>
        <FormField labelKey={copy.to}>
          <InputText
            labelKey={copy.to}
            name="to"
            type="date"
            defaultValue={to}
          />
        </FormField>
        <div className="self-end">
          <ButtonPrimary type="submit" labelKey={copy.applyFilters} />
        </div>
      </form>

      <section className="grid gap-3">
        {entries.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-5 text-text-secondary">
            {copy.empty}
          </p>
        ) : null}
        {entries.map((entry) => (
          <article key={entry.id} className="grid gap-2 rounded-md border border-border bg-surface p-4">
            <p className="font-medium text-text-primary">{entry.text}</p>
            <dl className="grid gap-2 text-sm text-text-secondary md:grid-cols-3">
              <div>
                <dt className="font-medium text-text-primary">{copy.date}</dt>
                <dd>{entryDate(entry.at)}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.actionKind}</dt>
                <dd>{actionLabel(entry.actionKind)}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.actor}</dt>
                <dd>{entry.actorKind}</dd>
              </div>
            </dl>
            {entry.details.length > 0 ? (
              <dl className="grid gap-2 border-t border-border pt-3 text-sm text-text-secondary md:grid-cols-3">
                {entry.details.map((detail) => (
                  <div key={`${entry.id}-${detail.label}`}>
                    <dt className="font-medium text-text-primary">{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
