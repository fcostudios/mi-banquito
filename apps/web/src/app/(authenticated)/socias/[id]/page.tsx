import { notFound } from "next/navigation";
import { ButtonDestructive, ButtonPrimary, FormField, InputNumber, InputText, StatusPill } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import { createLedgerService, mapComplianceStatusToTone } from "@mi-banquito/domain";
import messages from "@/lib/i18n/en-US.json";
import { transitionMemberStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default async function ScrMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTreasurer();
  const { id } = await params;
  const row = await createLedgerService().getMember(session.orgId, id);
  if (!row) notFound();
  const state = row.status === "activo" ? "al_dia" : "atrasado";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{row.displayName}</h1>
        <p className="mt-2 text-text-secondary">{copy.members.detailTitle}</p>
        <div className="mt-3">
          <StatusPill tone={mapComplianceStatusToTone(state)} label={row.status} />
        </div>
      </header>
      <p className="text-text-secondary">{copy.members.preserve}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <form action={transitionMemberStatusAction} className="grid gap-3 rounded-md border border-border bg-surface p-4">
          <input type="hidden" name="memberId" value={row.id} />
          <input type="hidden" name="nextStatus" value="en_pausa" />
          <FormField labelKey={copy.common.reason}>
            <InputText labelKey={copy.common.reason} name="reason" required />
          </FormField>
          <ButtonPrimary type="submit" labelKey={copy.members.pause} />
        </form>
        <form action={transitionMemberStatusAction} className="grid gap-3 rounded-md border border-border bg-surface p-4">
          <input type="hidden" name="memberId" value={row.id} />
          <input type="hidden" name="nextStatus" value="baja" />
          <FormField labelKey={copy.common.reason}>
            <InputText labelKey={copy.common.reason} name="reason" required />
          </FormField>
          <FormField labelKey={copy.members.refund}>
            <InputNumber name="refundAmount" defaultValue={row.initialSavingsBalance} min="0" step="0.01" />
          </FormField>
          <ButtonDestructive type="submit" labelKey={copy.members.deactivate} />
        </form>
      </div>
    </main>
  );
}
