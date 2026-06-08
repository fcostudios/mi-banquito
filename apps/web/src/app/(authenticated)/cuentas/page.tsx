// SCAFFOLD (SCR-accounts) — generated page stub. Build the real screen per its spec: docs/screens/SCR-accounts.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAccountsPage() {
  const title = pages["cuentas"]?.title ?? "Cuentas del grupo";
  return (
    <div className="p-6" data-scaffold={"SCR-accounts"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-accounts"}
      </p>
    </div>
  );
}
