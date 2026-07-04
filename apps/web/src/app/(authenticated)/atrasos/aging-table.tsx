import {
  buildChaseMessage,
  buildWhatsAppChaseUrl,
  defaultPromiseDate,
  type ChaseObligationKind,
  type CollectionsAgingRow,
  type DateOnlyString,
} from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputText } from "@mi-banquito/ui";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { markPromiseAction, recordChaseAttemptAction } from "./actions";

const copy = messages.atrasos;

const reasonLabels: Record<ChaseObligationKind, string> = {
  aporte: copy.reasonAporte,
  cuota: copy.reasonCuota,
};

function todayIso(): DateOnlyString {
  return new Date().toISOString().slice(0, 10) as DateOnlyString;
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

function hiddenSourceFields(row: CollectionsAgingRow) {
  return (
    <>
      <input type="hidden" name="memberId" value={row.memberId ?? ""} />
      <input type="hidden" name="loanId" value={row.loanId ?? ""} />
      <input type="hidden" name="cycleId" value={row.cycleId ?? ""} />
    </>
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

export function AgingTable({ rows }: { rows: CollectionsAgingRow[] }) {
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
      {rows.map((row) => {
        const rowWhatsappUrl = whatsappUrl(row);
        const canAct = hasActionSource(row);

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
              <p className="text-xl font-bold text-text-primary">{formatMoney(row.amountDue)}</p>
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
              <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_auto]">
                <form action={markPromiseAction} className="grid gap-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-end">
                  {hiddenSourceFields(row)}
                  <FormField labelKey={copy.promiseDate}>
                    <InputText
                      labelKey={copy.promiseDate}
                      name="promisedOn"
                      type="date"
                      defaultValue={defaultPromisedOn}
                      required
                    />
                  </FormField>
                  <FormField labelKey={copy.promiseNote}>
                    <InputText
                      labelKey={copy.promiseNote}
                      name="note"
                      placeholderKey={copy.promiseNotePlaceholder}
                    />
                  </FormField>
                  <ButtonPrimary type="submit" labelKey={copy.markPromise} />
                </form>

                <div className="flex flex-wrap items-end gap-2">
                  {rowWhatsappUrl ? (
                    <form action={recordChaseAttemptAction}>
                      {hiddenSourceFields(row)}
                      <input type="hidden" name="reasonKind" value={reasonKind(row.reasonKind) ?? ""} />
                      <input type="hidden" name="periodLabel" value={row.periodLabel} />
                      <input type="hidden" name="memberName" value={row.memberName} />
                      <input type="hidden" name="whatsappNumber" value={row.whatsappNumber ?? ""} />
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
