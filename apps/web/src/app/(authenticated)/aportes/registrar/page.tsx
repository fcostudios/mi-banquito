import { randomUUID } from "node:crypto";
import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Radio, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { recordContributionAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default async function ScrRecordContributionPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    confirm?: string;
    clientRequestId?: string;
    memberId?: string;
    amount?: string;
    datedOn?: string;
    paymentSource?: string;
    targetLoanId?: string;
    targetCycleId?: string;
  }>;
}) {
  const session = await requireTreasurer();
  const members = await createLedgerService().listMembers(session.orgId);
  const params = await searchParams;
  const errorMessage = params?.error ? decodeURIComponent(params.error) : undefined;
  const showConfirmation = params?.confirm === "1";
  const clientRequestId = params?.clientRequestId || randomUUID();
  const defaultMemberId = params?.memberId ?? members[0]?.id;
  const defaultPaymentSource = params?.paymentSource ?? "cash_in_meeting";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.contributions.title}</h1>
      <form action={recordContributionAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        {errorMessage ? (
          <div className="rounded-md border border-error bg-surface p-3 text-sm text-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        {params?.targetLoanId ? <input type="hidden" name="targetLoanId" value={params.targetLoanId} /> : null}
        {params?.targetCycleId ? <input type="hidden" name="targetCycleId" value={params.targetCycleId} /> : null}
        <FormField labelKey={copy.common.member}>
          <Select name="memberId" defaultValue={defaultMemberId} required>
            {members.map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.common.amount}>
          <InputNumber name="amount" min="0.01" step="0.01" defaultValue={params?.amount} required />
        </FormField>
        <FormField labelKey={copy.common.date}>
          <InputText labelKey={copy.common.date} name="datedOn" type="date" defaultValue={params?.datedOn ?? todayISO()} required />
        </FormField>
        <FormField labelKey={copy.contributions.paymentSource}>
          <Select name="paymentSource" defaultValue={defaultPaymentSource} required>
            <option value="cash_in_meeting">{copy.contributions.cashInMeeting}</option>
            <option value="bank_transfer">{copy.contributions.bankTransfer}</option>
            <option value="petty_cash_deposit">{copy.contributions.pettyCashDeposit}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.contributions.slip}>
          <InputText labelKey={copy.contributions.slip} name="slipPhotoId" />
        </FormField>
        <FormField labelKey={copy.common.notes}>
          <InputText labelKey={copy.common.notes} name="notes" />
        </FormField>
        {showConfirmation ? (
          <fieldset className="grid gap-2 rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-text-primary">Queda dinero sin aplicar</legend>
            <Radio name="extraDecision" value="extra_savings" label="Aporte extra / ahorro" defaultChecked />
            <Radio name="extraDecision" value="future_contribution" label="Prepagar aporte futuro" />
            <Radio name="extraDecision" value="loan_principal" label="Abonar a capital" />
          </fieldset>
        ) : null}
        <div>
          <ButtonPrimary type="submit" labelKey={copy.contributions.submit} />
        </div>
      </form>
    </main>
  );
}
