import { ButtonPrimary, FormField, InputText, Select } from "@mi-banquito/ui";

import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_HISTORY } from "@/lib/routes";

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
  expenseClientRequestId: string;
  transferClientRequestId: string;
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
  const allowedCategory = category === "transfer" || categoryValues.some((value) => value === category);
  if (
    (saved === "expense" || saved === "transfer")
    && allowedCategory
    && currency === "USD"
    && amount !== undefined
    && /^\d+\.\d{4}$/.test(amount)
  ) {
    const label = category === "transfer"
      ? copy.categories.transfer
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
  expenseClientRequestId,
  transferClientRequestId,
  today,
}: MovementFormsProps) {
  const defaultFrom = accounts[0]?.id;
  const defaultTo = accounts[1]?.id ?? defaultFrom;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-sm text-text-secondary">{copy.subtitle}</p>
      </header>

      <Feedback search={search} />

      <section className="rounded-md border border-info-text bg-info-bg p-4 text-text-primary" data-testid="help_banner">
        <h2 className="text-base font-semibold">{copy.helpTitle}</h2>
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
            <h2 className="text-base font-semibold">{copy.governedTitle}</h2>
            <p className="mt-1 text-sm">{copy.governedBody}</p>
          </section>
        </>
      )}
    </main>
  );
}
