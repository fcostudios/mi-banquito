// SCAFFOLD (SCR-admin-org-detail) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-org-detail.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminOrgDetailPage() {
  const title = pages["admin/orgs/[id]"]?.title ?? "Detalle de org";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-org-detail"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-org-detail"}
      </p>
    </div>
  );
}
