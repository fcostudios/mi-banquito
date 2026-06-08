// SCAFFOLD (SCR-admin-orgs-new) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-orgs-new.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminOrgsNewPage() {
  const title = pages["admin/orgs/nueva"]?.title ?? "Nueva organización";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-orgs-new"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-orgs-new"}
      </p>
    </div>
  );
}
