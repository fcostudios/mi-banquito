import { ButtonPrimary, FormField, InputText, Select } from "@mi-banquito/ui";
import type { PendingDepositCursor, RegularizableKind } from "@mi-banquito/domain";
import { Info, ShieldCheck } from "lucide-react";

import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_HISTORY } from "@/lib/routes";
import { pendingMovementHref } from "./pending-pagination";

type FormAction = (formData: FormData) => void | Promise<void>;
type SearchValue = string | string[] | undefined;

export type MovementAccountOption = {
  id: string;
  name: string;
  last4: string | null;
  balance: string;
};

export type MovementFormsProps = {
  accounts: MovementAccountOption[];
  search: Record<string, SearchValue>;
  expenseAction: FormAction;
  transferAction: FormAction;
  regularizationAction: FormAction;
  compensationAction: FormAction;
  compensation: {
    cumulativeEntitlement: string;
    cumulativePaid: string;
    payableNow: string;
  };
  fiscalYear: number;
  pendingDeposits: Array<{
    id: string;
    sourceKind: RegularizableKind;
    memberName: string;
    accountId: string | null;
    accountName: string | null;
    amount: string;
    remaining: string;
    datedOn: string;
  }>;
  nextCursor?: PendingDepositCursor | null;
  expenseClientRequestId: string;
  transferClientRequestId: string;
  regularizationClientRequestId: string;
  compensationClientRequestId: string;
  today: string;
};

const copy = messages.movements;
const categoryValues = [
  "bank_fee",
  "supplies",
  "shared_expense",
  "operating",
  "solidarity_payout",
  "treasurer_comp_payout",
] as const;

function scalar(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeMoney4(value: SearchValue): string | undefined {
  const scalarValue = scalar(value);
  return scalarValue && /^\d{1,14}\.\d{4}$/.test(scalarValue) ? scalarValue : undefined;
}

function displayMoney(value: string): string {
  const [whole, fraction] = value.split(".");
  return `USD ${whole}.${fraction?.slice(0, 2) ?? "00"}`;
}

function accountLabel(account: MovementAccountOption): string {
  return account.last4
    ? copy.accountWithLast4.replace("{{name}}", account.name).replace("{{last4}}", account.last4)
    : account.name;
}

function Feedback({ search }: { search: Record<string, SearchValue> }) {
  const saved = scalar(search.saved);
  const category = scalar(search.category);
  const currency = scalar(search.currency);
  const amount = scalar(search.amount);
  const allowedCategory = category === "transfer" || category === "regularization" || categoryValues.some((value) => value === category);
  if (
    (saved === "expense" || saved === "transfer")
    && allowedCategory
    && currency === "USD"
    && amount !== undefined
    && /^\d+\.\d{4}$/.test(amount)
  ) {
    const label = category === "transfer" || category === "regularization"
      ? copy.categories[category]
      : copy.categories[category as (typeof categoryValues)[number]];
    return (
      <div className="rounded-md border border-success bg-surface p-3 text-sm font-semibold text-text-primary" role="status">
        {copy.success
          .replace("{{category}}", label)
          .replace("{{currency}}", currency)
          .replace("{{amount}}", amount)}
      </div>
    );
  }

  const error = scalar(search.error);
  if (error === "compensation-ceiling-exceeded") {
    const cumulativeEntitlement = safeMoney4(search.cumulativeEntitlement);
    const cumulativePaid = safeMoney4(search.cumulativePaid);
    const payableNow = safeMoney4(search.payableNow);
    if (cumulativeEntitlement && cumulativePaid && payableNow) {
      return (
        <div className="rounded-md border border-error-text bg-error-bg p-3 text-sm font-semibold text-text-primary" role="alert">
          {copy.compensationOverCeiling
            .replace("{{cumulativeEntitlement}}", displayMoney(cumulativeEntitlement))
            .replace("{{cumulativePaid}}", displayMoney(cumulativePaid))
            .replace("{{payableNow}}", displayMoney(payableNow))}
        </div>
      );
    }
  }
  const errorMessage = error && Object.prototype.hasOwnProperty.call(copy.errors, error)
    ? copy.errors[error as keyof typeof copy.errors]
    : undefined;
  return errorMessage ? (
    <div className="rounded-md border border-error-text bg-error-bg p-3 text-sm font-semibold text-text-primary" role="alert">
      {errorMessage}
    </div>
  ) : null;
}

function AccountOptions({ accounts }: { accounts: MovementAccountOption[] }) {
  return accounts.map((account) => (
    <option key={account.id} value={account.id}>{accountLabel(account)}</option>
  ));
}

function MoneyAndDateFields({ today, prefix }: { today: string; prefix: string }) {
  return (
    <div className="grid grid-cols-1 gap-4" data-testid={prefix === "expense" ? "common_tail" : "transfer_common_tail"}>
      <FormField controlId={`${prefix}-amount`} labelKey={copy.amount}>
        <input
          className="min-h-12 w-full rounded-md border border-border bg-surface px-4 text-text-primary focus:border-primary"
          id={`${prefix}-amount`}
          inputMode="decimal"
          name="amount"
          pattern="[0-9]+([.,][0-9]{1,4})?"
          placeholder={copy.amountPlaceholder}
          required
          type="text"
        />
      </FormField>
      <FormField controlId={`${prefix}-date`} labelKey={copy.date}>
        <InputText id={`${prefix}-date`} labelKey={copy.date} name="datedOn" type="date" defaultValue={today} required />
      </FormField>
      <FormField controlId={`${prefix}-notes`} labelKey={copy.notes}>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-surface px-4 py-3 text-text-primary focus:border-primary"
          id={`${prefix}-notes`}
          maxLength={2000}
          name="notes"
        />
      </FormField>
    </div>
  );
}

export function ecuadorTodayISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function MovementForms({
  accounts,
  search,
  expenseAction,
  transferAction,
  regularizationAction,
  compensationAction,
  compensation,
  fiscalYear,
  pendingDeposits,
  nextCursor = null,
  expenseClientRequestId,
  transferClientRequestId,
  regularizationClientRequestId,
  compensationClientRequestId,
  today,
}: MovementFormsProps) {
  const defaultFrom = accounts[0]?.id;
  const defaultTo = accounts[1]?.id ?? defaultFrom;
  const requestedKind = scalar(search.regularizesKind);
  const requestedId = scalar(search.regularizesId);
  const selectedPending = pendingDeposits.find((row) => row.sourceKind === requestedKind && row.id === requestedId)
    ?? pendingDeposits[0];
  const compensationExhausted = compensation.payableNow === "0.0000";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-sm text-text-secondary">{copy.subtitle}</p>
      </header>

      <Feedback search={search} />

      <section className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:p-5" data-testid="regularization_group">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{copy.regularizationTitle}</h2>
          <p className="mt-1 text-sm text-text-secondary">{copy.regularizationSubtitle}</p>
        </div>
        {pendingDeposits.length === 0 ? (
          <p className="text-sm text-text-secondary">{copy.noPendingDeposits}</p>
        ) : (
          <>
            <div className="grid gap-2" aria-label={copy.pendingDeposits}>
              {pendingDeposits.map((row) => (
                <a
                  className="grid min-h-12 grid-cols-1 gap-1 border-b border-border py-2 text-primary sm:grid-cols-[1fr_auto]"
                  href={pendingMovementHref(search, {
                    regularizesKind: row.sourceKind,
                    regularizesId: row.id,
                  })}
                  key={`${row.sourceKind}:${row.id}`}
                >
                  <span>{row.memberName} · {row.accountName ?? copy.legacyAccount}</span>
                  <span>USD {row.amount}</span>
                </a>
              ))}
            </div>
            {nextCursor ? (
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-primary px-4 font-semibold text-primary"
                href={pendingMovementHref(search, {
                  pendingDate: nextCursor.datedOn,
                  pendingKind: nextCursor.sourceKind,
                  pendingId: nextCursor.id,
                })}
              >
                {copy.loadMorePending}
              </a>
            ) : null}
            {selectedPending?.accountId ? (
              <form action={regularizationAction} className="grid w-full grid-cols-1 gap-4">
                <input name="clientRequestId" type="hidden" value={regularizationClientRequestId} />
                <input name="regularizesKind" type="hidden" value={selectedPending.sourceKind} />
                <input name="regularizesId" type="hidden" value={selectedPending.id} />
                <div>
                  <p className="text-sm text-text-secondary">{copy.fromAccount}</p>
                  <p className="font-semibold text-text-primary">{selectedPending.accountName ?? copy.legacyAccount}</p>
                </div>
                <FormField controlId="regularization-to" labelKey={copy.regularizationTarget}>
                  <Select id="regularization-to" name="toAccountId" defaultValue={accounts[0]?.id} required>
                    <AccountOptions accounts={accounts} />
                  </Select>
                </FormField>
                <FormField controlId="regularization-amount" labelKey={copy.amount}>
                  <input className="min-h-12 w-full rounded-md border border-border bg-surface px-4" id="regularization-amount" inputMode="decimal" name="amount" defaultValue={selectedPending.remaining} required />
                </FormField>
                <FormField controlId="regularization-date" labelKey={copy.date}>
                  <InputText id="regularization-date" labelKey={copy.date} name="datedOn" type="date" defaultValue={today} required />
                </FormField>
                <FormField controlId="regularization-notes" labelKey={copy.notes}>
                  <textarea className="min-h-24 w-full rounded-md border border-border bg-surface px-4 py-3" id="regularization-notes" name="notes" maxLength={2000} />
                </FormField>
                <label className="flex min-h-12 items-center gap-3 text-text-primary">
                  <input name="confirmed" type="checkbox" value="yes" required />
                  <span>{copy.regularizationConfirm}</span>
                </label>
                <ButtonPrimary labelKey={copy.saveRegularization} type="submit" disabled={accounts.length === 0} />
              </form>
            ) : <p className="text-sm text-warning-text">{copy.legacyCannotRegularize}</p>}
          </>
        )}
      </section>

      <section className="rounded-md border border-info-text bg-info-bg p-4 text-text-primary" data-testid="help_banner">
        <div className="flex items-center gap-2">
          <Info aria-hidden="true" className="size-5 shrink-0" focusable="false" />
          <h2 className="text-base font-semibold">{copy.helpTitle}</h2>
        </div>
        <p className="mt-1 text-sm">{copy.helpBody}</p>
      </section>

      {accounts.length > 0 ? (
        <section aria-label={copy.accountBalances} className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="account_balances">
          {accounts.map((account) => (
            <div className="flex items-center justify-between gap-4 border-b border-border py-2" key={account.id}>
              <span className="font-medium text-text-primary">{account.name}</span>
              <span className="font-semibold text-text-primary">
                {copy.balanceCurrency.replace("{{balance}}", account.balance)}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {accounts.length === 0 ? (
        <div className="rounded-md border border-warning-text bg-warning-bg p-4 text-text-primary" data-testid="movement_blocked_banner" role="alert">
          <h2 className="font-semibold">{copy.blockedTitle}</h2>
          <p className="mt-1 text-sm">{copy.blockedDescription}</p>
        </div>
      ) : (
        <>
          <section data-testid="salida_group">
            <form action={expenseAction} className="grid w-full grid-cols-1 gap-4 rounded-md border border-border bg-surface p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{copy.expenseTitle}</h2>
                <p className="mt-1 text-sm text-text-secondary">{copy.expenseSubtitle}</p>
              </div>
              <input name="clientRequestId" type="hidden" value={expenseClientRequestId} />
              <FormField controlId="expense-account" labelKey={copy.expenseAccount}>
                <Select data-testid="account_id" defaultValue={defaultFrom} id="expense-account" name="accountId" required>
                  <AccountOptions accounts={accounts} />
                </Select>
              </FormField>
              <FormField controlId="expense-category" labelKey={copy.category}>
                <Select data-testid="category" defaultValue="bank_fee" id="expense-category" name="category" required>
                  {categoryValues.map((value) => <option key={value} value={value}>{copy.categories[value]}</option>)}
                </Select>
              </FormField>
              <MoneyAndDateFields prefix="expense" today={today} />
              <FormField controlId="expense-slip" helperTextKey={copy.slipHelp} labelKey={copy.slip}>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="min-h-12 w-full rounded-md border border-border bg-surface px-4 py-2 text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-text-on-primary"
                  data-testid="slip_photo"
                  id="expense-slip"
                  name="slipPhoto"
                  type="file"
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonPrimary labelKey={copy.saveExpense} type="submit" />
                <a className="font-semibold text-secondary underline-offset-4 hover:underline" href={ROUTE_SCR_HISTORY}>{copy.cancel}</a>
              </div>
            </form>
          </section>

          <section data-testid="transfer_group">
            <form action={transferAction} className="grid w-full grid-cols-1 gap-4 rounded-md border border-border bg-surface p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{copy.transferTitle}</h2>
                <p className="mt-1 text-sm text-text-secondary">{copy.transferSubtitle}</p>
              </div>
              <input name="clientRequestId" type="hidden" value={transferClientRequestId} />
              <FormField controlId="transfer-from" labelKey={copy.fromAccount}>
                <Select data-testid="from_account_id" defaultValue={defaultFrom} id="transfer-from" name="fromAccountId" required>
                  <AccountOptions accounts={accounts} />
                </Select>
              </FormField>
              <FormField controlId="transfer-to" labelKey={copy.toAccount}>
                <Select data-testid="to_account_id" defaultValue={defaultTo} id="transfer-to" name="toAccountId" required>
                  <AccountOptions accounts={accounts} />
                </Select>
              </FormField>
              <MoneyAndDateFields prefix="transfer" today={today} />
              {accounts.length < 2 ? (
                <p className="rounded-md border border-warning-text bg-warning-bg p-3 text-sm text-text-primary" role="status">
                  {copy.transferNeedsTwoAccounts}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <ButtonPrimary disabled={accounts.length < 2} labelKey={copy.saveTransfer} type="submit" />
                <a className="font-semibold text-secondary underline-offset-4 hover:underline" href={ROUTE_SCR_HISTORY}>{copy.cancel}</a>
              </div>
            </form>
          </section>

          <section className="rounded-md border border-info-text bg-info-bg p-4 text-text-primary" data-testid="ceiling_note">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5 shrink-0" focusable="false" />
              <h2 className="text-base font-semibold">{copy.compensationCeilingNoteTitle}</h2>
            </div>
            <p className="mt-1 text-sm">{copy.compensationCeilingNoteBody}</p>
          </section>

          <section
            className="overflow-hidden rounded-md border border-primary bg-surface"
            data-testid="treasurer_comp_ceiling"
          >
            <div className="border-b border-primary bg-info-bg px-4 py-4 sm:px-5">
              <p className="text-sm font-semibold text-text-primary">{copy.compensationFiscalYear.replace("{{year}}", String(fiscalYear))}</p>
              <h2 className="mt-1 text-xl font-bold text-text-primary">{copy.compensationTitle}</h2>
            </div>
            <div className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
              {([
                ["cumulative_entitlement", copy.compensationEntitlement, compensation.cumulativeEntitlement],
                ["cumulative_paid", copy.compensationPaid, compensation.cumulativePaid],
                ["payable_now", copy.compensationAvailable, compensation.payableNow],
              ] as const).map(([id, label, value], index) => (
                <div
                  className={`p-4 ${index < 2 ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}
                  data-testid={id}
                  key={id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
                  <p className={`mt-2 text-2xl font-bold ${index === 2 ? "text-primary" : "text-text-primary"}`}>
                    {displayMoney(value)}
                  </p>
                </div>
              ))}
            </div>
            <form action={compensationAction} className="grid w-full grid-cols-1 gap-4 p-4 sm:p-5">
              <input name="clientRequestId" type="hidden" value={compensationClientRequestId} />
              <input name="fiscalYear" type="hidden" value={fiscalYear} />
              <FormField controlId="compensation-account" labelKey={copy.expenseAccount}>
                <Select defaultValue={defaultFrom} id="compensation-account" name="accountId" required>
                  <AccountOptions accounts={accounts} />
                </Select>
              </FormField>
              <MoneyAndDateFields prefix="compensation" today={today} />
              {compensationExhausted ? (
                <p className="rounded-md border border-warning-text bg-warning-bg p-3 text-sm font-semibold text-text-primary" role="status">
                  {copy.compensationExhausted}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <ButtonPrimary disabled={compensationExhausted} labelKey={copy.saveCompensation} type="submit" />
                <a className="font-semibold text-secondary underline-offset-4 hover:underline" href={ROUTE_SCR_HISTORY}>{copy.cancel}</a>
              </div>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
