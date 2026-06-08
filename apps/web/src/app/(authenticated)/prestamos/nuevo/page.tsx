// SCAFFOLD (SCR-originate-loan) — generated page stub. Build the real screen per its spec: docs/screens/SCR-originate-loan.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrOriginateLoanPage() {
  const title = pages["prestamos/nuevo"]?.title ?? "Nuevo préstamo";
  return (
    <div className="p-6" data-scaffold={"SCR-originate-loan"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-originate-loan"}
      </p>
    </div>
  );
}
