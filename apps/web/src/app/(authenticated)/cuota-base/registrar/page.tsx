import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { recordBaseFundQuotaPaymentAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default async function ScrRecordBaseFundQuotaPage() {
  const session = await requireTreasurer();
  const defaults = await createLedgerService().getBaseFundQuotaDefaults(session.orgId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.quota.title}</h1>
      <form action={recordBaseFundQuotaPaymentAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        <FormField labelKey={copy.common.member}>
          <Select name="memberId" required>
            {defaults.members.map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.quota.fiscalYear}>
          <InputNumber name="fiscalYear" defaultValue={defaults.fiscalYear} min="2000" max="2100" step="1" />
        </FormField>
        <FormField labelKey={copy.common.amount}>
          <InputNumber name="amount" defaultValue={defaults.amount} min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.quota.paidOn}>
          <InputText labelKey={copy.quota.paidOn} name="paidOn" type="date" defaultValue={todayISO()} required />
        </FormField>
        <FormField labelKey={copy.contributions.slip}>
          <InputText labelKey={copy.contributions.slip} name="slipPhotoId" />
        </FormField>
        <div>
          <ButtonPrimary type="submit" labelKey={copy.quota.submit} />
        </div>
      </form>
    </main>
  );
}
