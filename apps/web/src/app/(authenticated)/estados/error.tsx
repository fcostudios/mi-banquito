"use client";

import { ButtonPrimary } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";

export default function StatementsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void error;
  return <main className="mx-auto grid w-full max-w-5xl gap-4 p-6" data-testid="statements_error">
    <h1 className="text-2xl font-bold text-text-primary">{messages.pages.estados.title}</h1>
    <p className="rounded-md border border-border bg-surface p-5 text-text-secondary">{messages.statementArchive.loadError}</p>
    <ButtonPrimary type="button" onClick={reset}>{messages.statementArchive.retry}</ButtonPrimary>
  </main>;
}
