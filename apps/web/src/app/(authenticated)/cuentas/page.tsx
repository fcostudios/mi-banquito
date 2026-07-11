import { randomUUID } from "node:crypto";

import { createAccountsService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { AccountsRegistry } from "./accounts-registry";
import { deactivateAccountAction, saveAccountAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export default async function ScrAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const [accounts, search] = await Promise.all([
    createAccountsService().listAccounts(session.orgId),
    searchParams,
  ]);
  return (
    <AccountsRegistry
      accounts={accounts}
      search={search}
      saveAction={saveAccountAction}
      archiveAction={deactivateAccountAction}
      saveClientRequestId={randomUUID()}
    />
  );
}
