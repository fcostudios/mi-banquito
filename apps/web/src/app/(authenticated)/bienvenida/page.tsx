import { redirect } from "next/navigation";
import { createLedgerService, nextWizardStep } from "@mi-banquito/domain";
import { ButtonPrimary, FormField, InputText } from "@mi-banquito/ui";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { completeFirstRunAction, saveFirstRunNameAction } from "./actions";

export const dynamic = "force-dynamic";

const copy = messages.sprint1.firstRun;

export default async function ScrFirstRunWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const session = await requireTreasurer();
  const state = await createLedgerService().getFirstRunState(session.orgId);
  const persistedStep = nextWizardStep({
    firstRunStep: state.organization.firstRunStep,
    completedAt: state.organization.firstRunCompletedAt,
  });
  if (persistedStep === "complete") {
    redirect("/");
  }

  const { paso } = await searchParams;
  const requestedStep = paso === "reglas" ? 2 : paso === "confirmar" ? 3 : 1;
  const activeStep = Math.min(requestedStep, persistedStep);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="mt-2 text-text-secondary">{copy.intro}</p>
      </header>

      {activeStep === 1 ? (
        <form action={saveFirstRunNameAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{copy.nameStep}</h2>
          <FormField labelKey={copy.displayName}>
            <InputText
              labelKey={copy.displayName}
              name="displayName"
              required
              defaultValue={state.organization.displayName}
            />
          </FormField>
          <FormField labelKey={copy.logo}>
            <InputText
              labelKey={copy.logo}
              name="brandingLogoUri"
              inputMode="url"
              defaultValue={state.organization.brandingLogoUri ?? ""}
            />
          </FormField>
          <input type="hidden" name="nextStep" value="rules" />
          <div>
            <ButtonPrimary type="submit" labelKey={copy.continue} />
          </div>
        </form>
      ) : null}

      {activeStep === 2 ? (
        <section className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{copy.rulesStep}</h2>
          <ul className="grid gap-2">
            {state.rulesSummary.map((item) => (
              <li key={item} className="text-text-primary">{item}</li>
            ))}
          </ul>
          <a href="/bienvenida?paso=confirmar" className="text-primary">{copy.continue}</a>
        </section>
      ) : null}

      {activeStep === 3 ? (
        <form action={completeFirstRunAction} className="grid gap-4 rounded-md border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{copy.completeStep}</h2>
          <label className="flex items-center gap-2 text-text-primary">
            <input type="checkbox" name="confirmed" value="yes" required />
            <span>{copy.confirmed}</span>
          </label>
          <div>
            <ButtonPrimary type="submit" labelKey={copy.finish} />
          </div>
        </form>
      ) : null}
    </main>
  );
}
