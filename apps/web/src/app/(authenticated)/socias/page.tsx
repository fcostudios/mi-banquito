// SCR-members-list — TEMPLATE worked example (IMP-268): the READ leg of the
// central seam. A force-dynamic Server Component that resolves the tenant from the
// session (the SECURITY.md pattern — never from the request) and delegates the
// org-scoped query to the @mi-banquito/domain Ledger service. Copy this shape; the dev
// team owns the real list UI. One shape of many.
import { auth0 } from "@/lib/auth0";
import { createLedgerService } from "@mi-banquito/domain";
import { Tag } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";

// A page that reads request-time tenant data must opt out of prerender.
export const dynamic = "force-dynamic";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default async function MemberListPage() {
  const session = await auth0.getSession();
  const orgId = (session?.user?.org_id ?? "") as string; // tenant from the session claim
  const rows = await createLedgerService().listMembers(orgId);
  const title = pages["socias"]?.title ?? "Members";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <ul className="mt-4 space-y-1">
        {rows.map((row) => (
          // the @mi-banquito/ui render leg — a real shared component (a presentational
          // atom; the read page is a Server Component, so no event handlers).
          <li key={row.id}>
            <Tag label={row.displayName ?? row.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
