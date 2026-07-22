"use client";

import { ButtonPrimary } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";

export default function CollectionsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6" data-screen="SCR-solidarity-collection">
      <section className="rounded-md border border-error-text bg-error-bg p-4 text-text-primary" role="alert">
        <h1 className="text-xl font-bold">{messages.collections.errorTitle}</h1>
        <p className="mt-2 text-sm">{messages.collections.errorBody}</p>
        <div className="mt-4">
          <ButtonPrimary labelKey={messages.collections.retry} onClick={reset} type="button" />
        </div>
      </section>
    </main>
  );
}
