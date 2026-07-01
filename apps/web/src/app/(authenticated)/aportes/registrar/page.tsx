import { randomUUID } from "node:crypto";
import { createLedgerService } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputNumber, InputText, Select } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { recordContributionAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default async function ScrRecordContributionPage() {
  const session = await requireTreasurer();
  const members = await createLedgerService().listMembers(session.orgId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.contributions.title}</h1>
      <form action={recordContributionAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        <input type="hidden" name="clientRequestId" value={randomUUID()} />
        <FormField labelKey={copy.common.member}>
          <Select name="memberId" required>
            {members.map((row) => (
              <option key={row.id} value={row.id}>{row.displayName}</option>
            ))}
          </Select>
        </FormField>
        <FormField labelKey={copy.common.amount}>
          <InputNumber name="amount" min="0" step="0.01" required />
        </FormField>
        <FormField labelKey={copy.common.date}>
          <InputText labelKey={copy.common.date} name="datedOn" type="date" defaultValue={todayISO()} required />
        </FormField>
        <FormField labelKey={copy.contributions.kind}>
          <Select name="kind" defaultValue="regular" required>
            <option value="regular">{copy.contributions.kindRegular}</option>
            <option value="partial">{copy.contributions.kindPartial}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.contributions.paymentSource}>
          <Select name="paymentSource" defaultValue="cash_in_meeting" required>
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
        <div>
          <ButtonPrimary type="submit" labelKey={copy.contributions.submit} />
        </div>
      </form>
    </main>
  );
}
