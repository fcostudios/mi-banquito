// SCAFFOLD (SCR-admin-business-rules) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-business-rules.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminBusinessRulesPage() {
  const title = pages["admin/orgs/[id]/business-rules"]?.title ?? "Reglas del grupo";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-business-rules"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-business-rules"}
      </p>
    </div>
  );
}
