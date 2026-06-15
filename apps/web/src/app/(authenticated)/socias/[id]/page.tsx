// Member detail — TEMPLATE worked example (IMP-269): a DYNAMIC-ROUTE leg of
// the seam. Next 16 passes route params as a Promise, so the signature is
// `params: Promise<{ id: string }>` and you MUST `await params`. force-dynamic
// (it reads the session). Org-scoped by id via the @mi-banquito/domain Ledger service; the
// @mi-banquito/ui Tag is the render leg. User-facing text comes from the i18n `messages`
// import (a Server Component CANNOT call the client `useLocale()` hook) — never a
// bare JSX string. Copy this shape for every `[id]` detail page.
import { auth0 } from "@/lib/auth0";
import { getDbOrgIdFromUser } from "@/lib/auth/session-claims";
import { ROUTE_LOGIN } from "@/lib/routes";
import { createLedgerService } from "@mi-banquito/domain";
import { Tag } from "@mi-banquito/ui";
import messages from "@/lib/i18n/en-US.json";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const pages = (messages as { pages?: Record<string, { title?: string }> }).pages ?? {};

export default async function MemberDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth0.getSession();
  const orgId = getDbOrgIdFromUser(session?.user);
  if (!orgId) {
    redirect(ROUTE_LOGIN);
  }

  const row = await createLedgerService().getMember(orgId, id);

  if (!row) {
    const notFound = pages["socias/[id]"]?.title ?? "Not found";
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">{notFound}</h1>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{row.displayName ?? row.id}</h1>
      <div className="mt-4">
        <Tag label={row.id} />
      </div>
    </div>
  );
}
