import { randomUUID } from "node:crypto";
import { createLedgerService, createLoanService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { todayISO } from "@/lib/format/es-ec";
import messages from "@/lib/i18n/en-US.json";
import { LoanOriginationForm } from "./loan-origination-form";

export const dynamic = "force-dynamic";

const copy = messages.sprint2.loans;

export default async function ScrOriginateLoanPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await requireTreasurer();
  const ledger = createLedgerService();
  const loanService = createLoanService();
  const [members, guarantorMembers] = await Promise.all([
    ledger.listMembers(session.orgId),
    loanService.listEligibleGuarantorMembers(session.orgId),
  ]);
  const activeMembers = members.filter((row) => row.status === "activo");
  const params = await searchParams;
  const errorMessage = params?.error ? decodeURIComponent(params.error) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" data-screen="SCR-originate-loan">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
        <p className="text-text-secondary">{copy.description}</p>
      </div>
      <LoanOriginationForm
        activeMembers={activeMembers.map((row) => ({ id: row.id, displayName: row.displayName }))}
        clientRequestId={randomUUID()}
        copy={copy}
        errorMessage={errorMessage}
        guarantorMembers={guarantorMembers.map((row) => ({ id: row.id, displayName: row.displayName }))}
        today={todayISO()}
      />
    </main>
  );
}
