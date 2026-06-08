// SCAFFOLD (SCR-admin-org-config) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-org-config.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminOrgConfigPage() {
  const title = pages["admin/orgs/[id]/config"]?.title ?? "Configuración de reglas";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-org-config"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-org-config"}
      </p>
    </div>
  );
}
