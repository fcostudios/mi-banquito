import { randomUUID } from "node:crypto";

import { createMovementService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import { recordExpenseAction, recordTransferAction, regularizePendingDepositAction } from "./actions";
import { ecuadorTodayISO, MovementForms } from "./movement-forms";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

export default async function ScrRecordMovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireTreasurer();
  const [accounts, pendingDeposits, search] = await Promise.all([
    createMovementService().listActiveGroupAccountBalances(session.orgId),
    createMovementService().listPendingDeposits(session.orgId),
    searchParams,
  ]);

  return (
    <MovementForms
      accounts={accounts.map(({ id, name, last4, balance }) => ({ id, name, last4, balance }))}
      search={search}
      expenseAction={recordExpenseAction}
      transferAction={recordTransferAction}
      regularizationAction={regularizePendingDepositAction}
      pendingDeposits={pendingDeposits.map((row) => ({
        id: row.id,
        sourceKind: row.sourceKind,
        memberName: row.memberName,
        accountId: row.accountId,
        accountName: row.accountName,
        amount: row.amount,
        remaining: row.remaining,
        datedOn: row.datedOn,
      }))}
      expenseClientRequestId={randomUUID()}
      transferClientRequestId={randomUUID()}
      regularizationClientRequestId={randomUUID()}
      today={ecuadorTodayISO()}
    />
  );
}
