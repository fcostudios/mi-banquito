// SCAFFOLD (SCR-admin-impersonation) — generated page stub. Build the real screen per its spec: docs/screens/SCR-admin-impersonation.json
import messages from "@/lib/i18n/en-US.json";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default function ScrAdminImpersonationPage() {
  const title = pages["admin/orgs/[id]/impersonate"]?.title ?? "Ver como tesorera";
  return (
    <div className="p-6" data-scaffold={"SCR-admin-impersonation"}>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-text-secondary">
        {"SCR-admin-impersonation"}
      </p>
    </div>
  );
}
