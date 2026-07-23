import messages from "@/lib/i18n/en-US.json";

export default function CollectionsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6" data-screen="SCR-solidarity-collection">
      <div aria-live="polite" className="rounded-md border border-border bg-surface p-4 text-text-secondary" role="status">
        {messages.collections.loading}
      </div>
      <div aria-hidden="true" className="grid gap-4">
        <div className="h-24 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-48 animate-pulse rounded-md bg-surface-muted" />
      </div>
    </main>
  );
}
