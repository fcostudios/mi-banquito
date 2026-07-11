import { randomUUID } from "node:crypto";

import { createMovementService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { recordExpenseAction, recordTransferAction } from "./actions";
import { ecuadorTodayISO, MovementForms } from "./movement-forms";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export default async function ScrRecordMovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const [accounts, search] = await Promise.all([
    createMovementService().listActiveGroupAccountBalances(session.orgId),
    searchParams,
  ]);

  return (
    <MovementForms
      accounts={accounts.map(({ id, name, last4, balance }) => ({ id, name, last4, balance }))}
      search={search}
      expenseAction={recordExpenseAction}
      transferAction={recordTransferAction}
      expenseClientRequestId={randomUUID()}
      transferClientRequestId={randomUUID()}
      today={ecuadorTodayISO()}
    />
  );
}
