import { randomUUID } from "node:crypto";
import { createLedgerService, createMovementService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Radio, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { recordContributionAction } from "./actions";
import { MemberSearchPicker } from "./member-search-picker";

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
    accountId?: string;
    amount?: string;
    datedOn?: string;
    paymentSource?: string;
    slipPhotoId?: string;
    notes?: string;
    targetLoanId?: string;
    targetCycleId?: string;
    saved?: string;
  }>;
}) {
  const session = await requireTreasurer();
  const [members, accounts] = await Promise.all([
    createLedgerService().listMembers(session.orgId),
    createMovementService().listActiveAccounts(session.orgId),
  ]);
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    "slip-required": copy.contributions.slipRequired,
    "invalid-form": copy.contributions.invalid,
    "group-account-required": copy.contributions.noGroupAccountBody,
    "account-unavailable": copy.contributions.accountUnavailable,
    "group-config-required": copy.contributions.groupConfigRequired,
    "cycle-required": copy.contributions.cycleRequired,
    "idempotency-conflict": copy.contributions.idempotencyConflict,
    "action-failed": copy.contributions.failed,
  };
  const errorMessage = params?.error ? errorMessages[params.error] ?? copy.contributions.failed : undefined;
  const showConfirmation = params?.confirm === "1";
  const clientRequestId = params?.clientRequestId || randomUUID();
  const defaultMemberId = params?.memberId ?? members[0]?.id;
  const savedMember = params?.saved === "1" ? members.find((member) => member.id === params.memberId) : undefined;
  const defaultPaymentSource = params?.paymentSource ?? "cash_in_meeting";
  const hasGroupAccount = accounts.some((account) => account.isGroupFund);
  const defaultAccountId = params?.accountId ?? accounts.find((account) => account.isGroupFund)?.id ?? accounts[0]?.id;

  const accountLabel = (account: (typeof accounts)[number]) => {
    const suffix = account.last4 ? ` ****${account.last4}` : "";
    return account.isGroupFund
      ? `${account.name}${suffix} - fondo del grupo`
      : `${account.name}${suffix} - pendiente de regularizar`;
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.contributions.title}</h1>
      {savedMember && params?.amount && params.datedOn ? (
        <p className="rounded-md border border-success-text bg-success-bg p-4 text-text-primary" role="status">
          Aporte de {savedMember.displayName} registrado — USD {Number(params.amount).toFixed(2)}, {params.datedOn}
        </p>
      ) : null}
      <div className="rounded-md border border-warning-text bg-warning-bg p-4 text-text-primary">
        <h2 className="font-semibold">{copy.contributions.allocationTitle}</h2>
        <p className="mt-1 text-sm">{copy.contributions.allocationBody}</p>
      </div>
      {!hasGroupAccount ? (
        <div className="rounded-md border border-warning-text bg-warning-bg p-4 text-text-primary" role="alert">
          <h2 className="font-semibold">{copy.contributions.noGroupAccountTitle}</h2>
          <p className="mt-1 text-sm">{copy.contributions.noGroupAccountBody}</p>
        </div>
      ) : <form action={recordContributionAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        {errorMessage ? (
          <div className="rounded-md border border-error bg-surface p-3 text-sm text-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        {params?.targetLoanId ? <input type="hidden" name="targetLoanId" value={params.targetLoanId} /> : null}
        {params?.targetCycleId ? <input type="hidden" name="targetCycleId" value={params.targetCycleId} /> : null}
        <MemberSearchPicker
          copy={{
            search: copy.contributions.memberSearch,
            placeholder: copy.contributions.memberSearchPlaceholder,
            member: copy.common.member,
            empty: copy.contributions.memberSearchEmpty,
          }}
          defaultMemberId={defaultMemberId}
          members={members}
        />
        <FormField controlId="contribution-account" helperTextKey={copy.contributions.accountHelp} labelKey={copy.contributions.account}>
          <Select id="contribution-account" name="accountId" defaultValue={defaultAccountId} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
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
        {params?.slipPhotoId ? <input name="slipPhotoId" type="hidden" value={params.slipPhotoId} /> : null}
        <FormField controlId="contribution-slip" helperTextKey={copy.contributions.slipHelp} labelKey={copy.contributions.slip}>
          <input
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="min-h-12 w-full rounded-md border border-border bg-surface px-4 py-2 text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-text-on-primary"
            id="contribution-slip"
            name="slipPhoto"
            type="file"
          />
        </FormField>
        <FormField labelKey={copy.common.notes}>
          <InputText labelKey={copy.common.notes} name="notes" defaultValue={params?.notes ?? ""} />
        </FormField>
        {showConfirmation ? (
          <fieldset className="grid gap-2 rounded-md border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-text-primary">{copy.contributions.extraDecisionTitle}</legend>
            <Radio name="extraDecision" value="extra_savings" label={copy.contributions.extraDecisionSavings} defaultChecked />
            <Radio name="extraDecision" value="future_contribution" label={copy.contributions.extraDecisionFuture} />
            {params?.targetLoanId ? (
              <Radio name="extraDecision" value="loan_principal" label={copy.contributions.extraDecisionPrincipal} />
            ) : null}
          </fieldset>
        ) : null}
        <div>
          <ButtonPrimary type="submit" labelKey={copy.contributions.submit} />
        </div>
      </form>}
    </main>
  );
}
