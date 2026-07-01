import { createLedgerService } from "@mi-banquito/domain";
import { FormField, InputNumber } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { ecCurrency } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.close;

export default async function ScrMonthlyClosePage() {
  const session = await requireTreasurer();
  const balances = await createLedgerService().getCashBalances(session.orgId);
  const rows = [
    {
      id: "bank",
      label: copy.bankBalance,
      value: balances.bankBalance,
      hint: copy.bankHint,
    },
    {
      id: "petty-cash",
      label: copy.pettyCashBalance,
      value: balances.pettyCashBalance,
      hint: copy.pettyCashHint,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" data-screen="SCR-monthly-close">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-text-secondary">{copy.description}</p>
      </div>

      <section className="grid gap-3 rounded-md border border-border bg-surface p-5" aria-label={copy.reconciliationRows}>
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-4 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <h2 className="font-semibold text-text-primary">{row.label}</h2>
              <p className="text-sm text-text-secondary">{row.hint}</p>
            </div>
            <div className="grid gap-3 md:min-w-56">
              <p className="text-xl font-bold text-text-primary">{ecCurrency.format(Number(row.value))}</p>
              <FormField labelKey={copy.declaredBalance}>
                <InputNumber
                  name={`declared-${row.id}`}
                  min="0"
                  step="0.01"
                  defaultValue={Number(row.value)}
                  aria-label={`${copy.declaredBalance}: ${row.label}`}
                />
              </FormField>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
