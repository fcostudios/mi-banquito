import { randomUUID } from "node:crypto";
import {
  buildChaseMessage,
  buildWhatsAppChaseUrl,
  defaultPromiseDate,
  type ChaseObligationKind,
  type CollectionsAgingRow,
  type DateOnlyString,
} from "@mi-banquito/domain";
import { currentEcuadorDateString } from "@mi-banquito/contracts";
import { ButtonPrimary, ButtonSecondary, Select } from "@mi-banquito/ui";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import {
  markPromiseAction,
  markPromiseOutcomeAction,
  recordChaseAttemptAction,
  recordOverdueContributionAction,
} from "./actions";
import { PromiseDialog } from "./promise-dialog";

const copy = messages.atrasos;

type DepositAccount = {
  id: string;
  name: string;
  last4: string | null;
  isGroupFund: boolean;
};

const reasonLabels: Record<ChaseObligationKind, string> = {
  aporte: copy.reasonAporte,
  cuota: copy.reasonCuota,
};

function todayIso(): DateOnlyString {
  return currentEcuadorDateString() as DateOnlyString;
}

function formatMoney(value: string | number): string {
  const numeric = Number(value);
  return ecCurrency.format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function reasonKind(value: string): ChaseObligationKind | null {
  return value === "aporte" || value === "cuota" ? value : null;
}

function reasonLabel(value: string): string {
  const kind = reasonKind(value);
  return kind ? reasonLabels[kind] : value;
}

function hasActionSource(row: CollectionsAgingRow): boolean {
  return Boolean(row.memberId && (row.loanId || row.cycleId));
}

function canRecordContributionPayment(row: CollectionsAgingRow): boolean {
  return row.reasonKind === "aporte" && Boolean(row.memberId && row.cycleId);
}

function hiddenSourceFields(row: CollectionsAgingRow) {
  return (
    <>
      <input type="hidden" name="memberId" value={row.memberId ?? ""} />
      <input type="hidden" name="loanId" value={row.loanId ?? ""} />
      <input type="hidden" name="cycleId" value={row.cycleId ?? ""} />
      <input type="hidden" name="periodLabel" value={row.periodLabel} />
    </>
  );
}

function PromiseOutcomeActions({ promiseId }: { promiseId: string }) {
  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <form action={markPromiseOutcomeAction} className="w-full sm:w-auto">
        <input type="hidden" name="promiseId" value={promiseId} />
        <input type="hidden" name="outcome" value="kept" />
        <ButtonSecondary type="submit" className="min-h-12 w-full justify-center rounded-md border border-primary bg-surface px-4 font-semibold text-primary sm:w-auto">
          {copy.promiseKeptAction}
        </ButtonSecondary>
      </form>
      <form action={markPromiseOutcomeAction} className="w-full sm:w-auto">
        <input type="hidden" name="promiseId" value={promiseId} />
        <input type="hidden" name="outcome" value="broken" />
        <ButtonSecondary type="submit" className="min-h-12 w-full justify-center rounded-md border border-border bg-surface px-4 font-semibold text-text-primary sm:w-auto">
          {copy.promiseBrokenAction}
        </ButtonSecondary>
      </form>
    </div>
  );
}

function accountLabel(account: DepositAccount): string {
  const suffix = account.last4 ? ` ****${account.last4}` : "";
  return account.isGroupFund
    ? `${account.name}${suffix} - ${copy.groupFundAccount}`
    : `${account.name}${suffix} - ${copy.pendingAccount}`;
}

function OverdueContributionPaymentAction({ row, accounts }: { row: CollectionsAgingRow; accounts: DepositAccount[] }) {
  const defaultAccount = accounts.find((account) => account.isGroupFund);
  return (
    <form action={recordOverdueContributionAction} className="grid w-full gap-2 sm:w-auto">
      <input type="hidden" name="clientRequestId" value={randomUUID()} />
      <input type="hidden" name="memberId" value={row.memberId ?? ""} />
      <input type="hidden" name="cycleId" value={row.cycleId ?? ""} />
      <label className="grid gap-1 text-sm text-text-secondary">
        <span>{copy.depositAccount}</span>
        <Select name="accountId" defaultValue={defaultAccount?.id} required>
          {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
        </Select>
      </label>
      <ButtonPrimary type="submit" labelKey={copy.recordPayment} disabled={!defaultAccount} />
    </form>
  );
}

function whatsappUrl(row: CollectionsAgingRow): string | null {
  const kind = reasonKind(row.reasonKind);
  if (!kind) {
    return null;
  }
  const message = buildChaseMessage({
    memberName: row.memberName,
    reasonKind: kind,
    periodLabel: row.periodLabel,
  });
  return buildWhatsAppChaseUrl({
    whatsappNumber: row.whatsappNumber,
    message,
  });
}

export function AgingTable({ rows, accounts }: { rows: CollectionsAgingRow[]; accounts: DepositAccount[] }) {
  const defaultPromisedOn = defaultPromiseDate(todayIso());

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-5 text-text-secondary">
        {copy.empty}
      </p>
    );
  }

  return (
    <section className="grid gap-3" data-testid="aging_table" aria-label={copy.title}>
      {rows.map((row, index) => {
        const rowWhatsappUrl = whatsappUrl(row);
        const canAct = hasActionSource(row);
        const controlId = `promise-${index}`;

        return (
          <article
            key={row.id}
            aria-label={row.memberName}
            className="grid gap-4 rounded-md border border-border bg-surface p-4"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-lg font-semibold text-text-primary">{row.memberName}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {reasonLabel(row.reasonKind)} · {row.periodLabel}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm text-text-secondary">{copy.amountDue}</p>
                <p className="text-xl font-bold text-text-primary">{formatMoney(row.amountDue)}</p>
              </div>
            </div>

            <dl className="grid gap-3 text-sm text-text-secondary sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-medium text-text-primary">{copy.reason}</dt>
                <dd>{reasonLabel(row.reasonKind)}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.period}</dt>
                <dd>{row.periodLabel}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.dueDate}</dt>
                <dd>{formatDateOnly(row.dueDate)}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.daysLate}</dt>
                <dd>{row.daysLate} {copy.daysLateSuffix}</dd>
              </div>
              <div>
                <dt className="font-medium text-text-primary">{copy.lastAction}</dt>
                <dd>{formatDateOnly(row.lastActionAt) || copy.noLastAction}</dd>
              </div>
            </dl>

            {canAct ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <PromiseDialog
                  action={markPromiseAction}
                  memberId={row.memberId ?? ""}
                  loanId={row.loanId ?? null}
                  cycleId={row.cycleId ?? null}
                  memberName={row.memberName}
                  periodLabel={row.periodLabel}
                  defaultPromisedOn={defaultPromisedOn}
                  controlId={controlId}
                />
                {row.openPromiseId ? (
                  <PromiseOutcomeActions promiseId={row.openPromiseId} />
                ) : null}
                {canRecordContributionPayment(row) ? (
                  <OverdueContributionPaymentAction row={row} accounts={accounts} />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {rowWhatsappUrl ? (
                    <form action={recordChaseAttemptAction}>
                      {hiddenSourceFields(row)}
                      <ButtonPrimary type="submit" labelKey={copy.whatsapp} />
                    </form>
                  ) : (
                    <span className="inline-flex min-h-12 items-center text-sm text-text-secondary">
                      {copy.missingContact}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="border-t border-border pt-4 text-sm text-text-secondary">{copy.missingSource}</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
