import { ButtonPrimary, FormField, InputText } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";
import { createOrganizationAction } from "../actions";

export const dynamic = "force-dynamic";

const copy = messages.adminOrgs.new;

export default function ScrAdminOrgsNewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.description}</p>
      </div>

      <form action={createOrganizationAction} className="grid gap-4">
        <FormField labelKey={copy.displayName}>
          <InputText labelKey={copy.displayName} name="displayName" required minLength={1} />
        </FormField>

        <input type="hidden" name="countryCode" value="EC" />
        <input type="hidden" name="currencyCode" value="USD" />
        <input type="hidden" name="timezone" value="America/Guayaquil" />
        <input type="hidden" name="defaultLanguage" value="es-EC" />

        <FormField labelKey={copy.brandingLogoUri}>
          <InputText
            labelKey={copy.brandingLogoUri}
            name="brandingLogoUri"
            inputMode="url"
            placeholderKey={copy.brandingPlaceholder}
          />
        </FormField>

        <div>
          <ButtonPrimary type="submit" labelKey={copy.submit} />
        </div>
      </form>
    </main>
  );
}
