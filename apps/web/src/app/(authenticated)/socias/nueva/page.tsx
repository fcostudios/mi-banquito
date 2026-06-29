import { ButtonPrimary, FormField, InputNumber, InputText, Select } from "@mi-banquito/ui";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { addMemberAction } from "../actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1;

export default function ScrAddMemberPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold text-text-primary">{copy.members.newTitle}</h1>
      <form action={addMemberAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
        <FormField labelKey={copy.common.displayName}>
          <InputText labelKey={copy.common.displayName} name="displayName" required />
        </FormField>
        <FormField labelKey={copy.common.whatsapp}>
          <InputText labelKey={copy.common.whatsapp} name="whatsappNumber" type="tel" placeholderKey="+593987654321" />
        </FormField>
        <FormField labelKey={copy.common.role}>
          <Select name="role" defaultValue="aportante">
            <option value="aportante">{copy.common.roles.aportante}</option>
            <option value="tesorera">{copy.common.roles.tesorera}</option>
            <option value="presidente">{copy.common.roles.presidente}</option>
            <option value="secretaria">{copy.common.roles.secretaria}</option>
          </Select>
        </FormField>
        <FormField labelKey={copy.common.date}>
          <InputText labelKey={copy.common.date} name="joinedOn" type="date" defaultValue={todayISO()} required />
        </FormField>
        <FormField labelKey={copy.common.initialSavings}>
          <InputNumber name="initialSavingsBalance" defaultValue="0" min="0" step="0.01" />
        </FormField>
        <FormField labelKey={copy.common.notes}>
          <InputText labelKey={copy.common.notes} name="notes" />
        </FormField>
        <div>
          <ButtonPrimary type="submit" labelKey={copy.members.add} />
        </div>
      </form>
    </main>
  );
}
