import { Key, User } from "lucide-react";
import { notFound } from "next/navigation";
import { createPlatformService } from "@mi-banquito/domain";
import { ImpersonationStartForm } from "@/components/impersonation/impersonation-start-form";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { startImpersonationAction } from "./actions";

const copy = messages.impersonation.start;

export default async function ScrAdminImpersonationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const org = await createPlatformService().getOrganization(id);
  if (!org) notFound();
  const action = startImpersonationAction.bind(null, org.id);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-6" data-screen="SCR-admin-impersonation">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-text-on-primary">
          <User className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
          <p className="mt-1 text-text-secondary">{copy.description.replace("{{org}}", org.displayName)}</p>
        </div>
      </header>
      <section className="grid gap-4 rounded-md border border-border bg-surface p-4 md:p-6" aria-label={copy.formLabel}>
        <div className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-4">
          <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-text-secondary">{copy.readOnlyNotice}</p>
        </div>
        <ImpersonationStartForm action={action} copy={copy} />
      </section>
    </main>
  );
}
