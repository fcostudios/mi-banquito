import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import { ButtonPrimary, Checkbox, FormField } from "@mi-banquito/ui";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { openAdjustmentPeriodAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.adjust;

export default async function ScrAdjustmentPeriodPage({
  params,
}: {
  params: Promise<{ id: string; periodCloseId: string }>;
}) {
  await requirePlatformOperator();
  const { id, periodCloseId } = await params;
  const org = await createPlatformService().getOrganization(id);

  if (!org) {
    notFound();
  }

  const openAdjustment = openAdjustmentPeriodAction.bind(null, org.id, periodCloseId);

  return (
    <main
      data-screen="SCR-adjustment-period"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
    >
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {copy.orgLabel} {org.displayName}
        </p>
      </header>

      <form action={openAdjustment} className="grid gap-5 rounded-md border border-border bg-surface p-5">
        <FormField labelKey={copy.reason} helperTextKey={copy.reasonHelp}>
          <textarea
            name="reason"
            aria-label={copy.reason}
            required
            minLength={1}
            rows={5}
            className="min-h-32 rounded-md border border-border bg-background px-3 py-2 text-text-primary"
          />
        </FormField>

        <Checkbox
          name="confirmed"
          value="true"
          required
          label={copy.confirmation}
        />

        <div>
          <ButtonPrimary type="submit" labelKey={copy.submit} />
        </div>
      </form>
    </main>
  );
}
