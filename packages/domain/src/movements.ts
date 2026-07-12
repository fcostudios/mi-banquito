import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { account, alert, auditLogEntry, contribution, expense, member, repayment, slipPhoto, transfer } from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export const EXPENSE_CATEGORIES = [
  "bank_fee",
  "supplies",
  "shared_expense",
  "operating",
  "solidarity_payout",
  "treasurer_comp_payout",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseRow = typeof expense.$inferSelect;
export type TransferRow = typeof transfer.$inferSelect;
export type MovementAccountRow = typeof account.$inferSelect;
export type MovementAccountBalance = MovementAccountRow & { balance: string };
export type PendingDeposit = {
  id: string;
  orgId: string;
  sourceKind: "contribution" | "repayment";
  amount: string;
  remaining: string;
  currencyCode: string;
  datedOn: string;
  accountId: string | null;
  accountName: string | null;
  memberId: string;
  memberName: string;
  notes: string | null;
};

export type DepositStatus = PendingDeposit & {
  reconciliationStatus: "pending" | "regularized";
};

type TransferAccount = Pick<MovementAccountRow, "id" | "orgId" | "isGroupFund" | "status">;

export type RecordExpenseInput = {
  orgId: string;
  actorId: string;
  accountId: string;
  category: string;
  amount: string;
  datedOn: string;
  notes?: string | null;
  clientRequestId: string;
  slipPhoto?: {
    uri: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    byteSize: number;
    contentHash: string;
  };
};

export type RecordTransferInput = {
  orgId: string;
  actorId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  datedOn: string;
  notes?: string | null;
  clientRequestId: string;
};

export type RegularizePendingDepositInput = {
  orgId: string;
  actorId: string;
  regularizesKind: "contribution" | "repayment";
  regularizesId: string;
  toAccountId: string;
  amount: string;
  datedOn: string;
  notes?: string | null;
  clientRequestId: string;
};

export type RegularizePendingDepositResult = {
  transfer: TransferRow;
  coverage: string;
  remaining: string;
  regularized: boolean;
};

export interface MovementService {
  readonly context: "movements";
  listActiveAccounts(orgId: string): Promise<MovementAccountRow[]>;
  listActiveGroupAccounts(orgId: string): Promise<MovementAccountRow[]>;
  listActiveGroupAccountBalances(orgId: string): Promise<MovementAccountBalance[]>;
  listPendingDeposits(orgId: string): Promise<PendingDeposit[]>;
  listMemberDeposits(orgId: string, memberId: string): Promise<DepositStatus[]>;
  isExpenseSlipUriReferenced(orgId: string, uri: string): Promise<boolean>;
  recordBlobCleanupRequired(input: {
    orgId: string;
    actorId: string;
    uri: string;
    contentHash: string;
    reason: "delete_failed" | "reference_check_failed";
  }): Promise<void>;
  recordExpense(input: RecordExpenseInput): Promise<ExpenseRow>;
  recordTransfer(input: RecordTransferInput): Promise<TransferRow>;
  regularizePendingDeposit(input: RegularizePendingDepositInput): Promise<RegularizePendingDepositResult>;
}

export function assertExpenseCategory(value: string): ExpenseCategory {
  if (!value) throw new Error("movement_category_required");
  const category = EXPENSE_CATEGORIES.find((candidate) => candidate === value);
  if (!category) throw new Error("movement_category_invalid");
  return category;
}

export function parsePositiveMoney4(value: string): string {
  if (value.length > 19) throw new Error("movement_amount_invalid");
  const match = /^(\d{1,14})(?:([.,])(\d{1,4}))?$/.exec(value);
  if (!match) throw new Error("movement_amount_invalid");
  const whole = match[1] ?? "";
  const fraction = (match[3] ?? "").padEnd(4, "0");
  const scale = BigInt(10_000);
  const units = BigInt(whole) * scale + BigInt(fraction || "0");
  if (units <= BigInt(0)) throw new Error("movement_amount_invalid");
  return `${units / scale}.${String(units % scale).padStart(4, "0")}`;
}

export function assertTransferAccounts<T extends TransferAccount>(input: { from: T; to: T }): { from: T; to: T } {
  if (input.from.id === input.to.id) throw new Error("transfer_accounts_must_differ");
  if (input.from.orgId !== input.to.orgId) throw new Error("transfer_accounts_same_org_required");
  if (input.from.status !== "active" || input.to.status !== "active") {
    throw new Error("transfer_account_unavailable");
  }
  if (!input.from.isGroupFund || !input.to.isGroupFund) {
    throw new Error("transfer_group_accounts_required");
  }
  return input;
}

export function transferAccountDeltas(input: {
  from: Pick<TransferAccount, "isGroupFund">;
  to: Pick<TransferAccount, "isGroupFund">;
  amount: string;
}): { from: string; to: string } {
  if (!input.from.isGroupFund || !input.to.isGroupFund) {
    throw new Error("transfer_group_accounts_required");
  }
  const amount = parsePositiveMoney4(input.amount);
  return { from: `-${amount}`, to: amount };
}

export function transferFundDelta(input: {
  from: Pick<TransferAccount, "isGroupFund">;
  to: Pick<TransferAccount, "isGroupFund">;
  amount: string;
}): "0.0000" {
  transferAccountDeltas(input);
  return "0.0000";
}

export function pendingDepositFundDelta(input: {
  reconciliationStatus: "pending" | "regularized";
  amount: string;
}): string {
  const amount = parsePositiveMoney4(input.amount);
  return input.reconciliationStatus === "regularized" ? amount : "0.0000";
}

export function shouldMarkRegularized(input: {
  sourceAmount: string;
  regularizedAmount: string;
}): boolean {
  return signedMoneyUnits(input.regularizedAmount) >= signedMoneyUnits(input.sourceAmount);
}

function normalizedNotes(notes: string | null | undefined): string | null {
  const value = notes?.trim();
  return value || null;
}

function deterministicUuid(parts: readonly string[]): string {
  const bytes = createHash("sha256").update(parts.join(":"), "utf8").digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertExpenseSlip(input: RecordExpenseInput): void {
  if ("slipPhotoId" in input) throw new Error("movement_slip_unavailable");
  if (!input.slipPhoto) return;
  if (
    !input.slipPhoto.uri.trim()
    || !/^[a-f0-9]{64}$/.test(input.slipPhoto.contentHash)
    || !["image/jpeg", "image/png", "image/webp"].includes(input.slipPhoto.mimeType)
    || !Number.isSafeInteger(input.slipPhoto.byteSize)
    || input.slipPhoto.byteSize <= 0
    || input.slipPhoto.byteSize > 5 * 1024 * 1024
  ) {
    throw new Error("movement_slip_invalid");
  }
}

function assertDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("movement_date_invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("movement_date_invalid");
  }
  return value;
}

function signedMoneyUnits(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) throw new Error("movement_balance_invalid");
  const scale = BigInt(10_000);
  const units = BigInt(match[2] ?? "0") * scale + BigInt((match[3] ?? "").padEnd(4, "0") || "0");
  return match[1] === "-" ? -units : units;
}

function formattedMoneyUnits(units: bigint): string {
  const scale = BigInt(10_000);
  const negative = units < BigInt(0);
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / scale}.${String(absolute % scale).padStart(4, "0")}`;
}

function remainingMoney(sourceAmount: string, coverage: string): string {
  const remaining = signedMoneyUnits(sourceAmount) - signedMoneyUnits(coverage);
  return formattedMoneyUnits(remaining > BigInt(0) ? remaining : BigInt(0));
}

function totalsByAccount(rows: Array<{ accountId: string | null; total: string }>): Map<string, bigint> {
  return new Map(rows.flatMap((row) => row.accountId ? [[row.accountId, signedMoneyUnits(String(row.total))]] : []));
}

export function createMovementService(options: { now?: () => Date } = {}): MovementService {
  const now = options.now ?? (() => new Date());

  return {
    context: "movements",

    async listActiveAccounts(orgId) {
      return withTenantTransaction(orgId, (tx) => tx.select().from(account).where(and(
        eq(account.orgId, orgId),
        eq(account.status, "active"),
      )).orderBy(asc(account.name), asc(account.id)));
    },

    async listActiveGroupAccounts(orgId) {
      return withTenantTransaction(orgId, (tx) => tx.select().from(account).where(and(
        eq(account.orgId, orgId),
        eq(account.status, "active"),
        eq(account.isGroupFund, true),
      )).orderBy(asc(account.name), asc(account.id)));
    },

    async listActiveGroupAccountBalances(orgId) {
      return withTenantTransaction(orgId, async (tx) => {
        const accounts = await tx.select().from(account).where(and(
          eq(account.orgId, orgId),
          eq(account.status, "active"),
          eq(account.isGroupFund, true),
        )).orderBy(asc(account.name), asc(account.id));
        const balanceRows = await tx.execute<{ accountId: string; total: string }>(sql`
          SELECT account_id AS "accountId", SUM(delta)::numeric(18, 4) AS total
          FROM (
            SELECT account_id, amount AS delta
            FROM contribution
            WHERE org_id = ${orgId} AND account_id IS NOT NULL
            UNION ALL
            SELECT account_id, amount AS delta
            FROM repayment
            WHERE org_id = ${orgId} AND account_id IS NOT NULL AND reverses_id IS NULL
            UNION ALL
            SELECT account_id, -amount AS delta
            FROM expense
            WHERE org_id = ${orgId} AND account_id IS NOT NULL AND status = 'paid' AND reverses_id IS NULL
            UNION ALL
            SELECT from_account_id AS account_id, -amount AS delta
            FROM transfer
            WHERE org_id = ${orgId} AND reverses_id IS NULL
            UNION ALL
            SELECT to_account_id AS account_id, amount AS delta
            FROM transfer
            WHERE org_id = ${orgId} AND reverses_id IS NULL
          ) movement_delta
          GROUP BY account_id
        `);
        const normalizedBalanceRows = Array.isArray(balanceRows) ? balanceRows : balanceRows.rows ?? [];
        const balanceTotals = totalsByAccount(normalizedBalanceRows);
        const zero = BigInt(0);
        return accounts.map((row) => ({
          ...row,
          balance: formattedMoneyUnits(balanceTotals.get(row.id) ?? zero),
        }));
      });
    },

    async listPendingDeposits(orgId) {
      return withTenantTransaction(orgId, async (tx) => {
        const contributionRows = await tx.select({
          id: contribution.id,
          orgId: contribution.orgId,
          amount: contribution.amount,
          currencyCode: contribution.currencyCode,
          datedOn: contribution.datedOn,
          accountId: contribution.accountId,
          accountName: account.name,
          memberId: contribution.memberId,
          memberName: member.displayName,
          notes: contribution.notes,
        }).from(contribution)
          .innerJoin(member, and(eq(member.orgId, contribution.orgId), eq(member.id, contribution.memberId)))
          .leftJoin(account, and(eq(account.orgId, contribution.orgId), eq(account.id, contribution.accountId)))
          .where(and(
          eq(contribution.orgId, orgId),
          eq(contribution.reconciliationStatus, "pending"),
        ));
        const repaymentRows = await tx.select({
          id: repayment.id,
          orgId: repayment.orgId,
          amount: repayment.amount,
          currencyCode: repayment.currencyCode,
          datedOn: repayment.datedOn,
          accountId: repayment.accountId,
          accountName: account.name,
          memberId: repayment.memberId,
          memberName: member.displayName,
          notes: repayment.notes,
        }).from(repayment)
          .innerJoin(member, and(eq(member.orgId, repayment.orgId), eq(member.id, repayment.memberId)))
          .leftJoin(account, and(eq(account.orgId, repayment.orgId), eq(account.id, repayment.accountId)))
          .where(and(
          eq(repayment.orgId, orgId),
          eq(repayment.reconciliationStatus, "pending"),
        ));
        const rows = [
          ...contributionRows.map((row) => ({ ...row, sourceKind: "contribution" as const })),
          ...repaymentRows.map((row) => ({ ...row, sourceKind: "repayment" as const })),
        ].sort((left, right) => (
          String(left.datedOn).localeCompare(String(right.datedOn))
          || left.sourceKind.localeCompare(right.sourceKind)
          || left.id.localeCompare(right.id)
        ));
        const coverageResult = await tx.execute<{ regularizesKind: string; regularizesId: string; total: string }>(sql`
          SELECT t.regularizes_kind AS "regularizesKind", t.regularizes_id AS "regularizesId",
                 COALESCE(SUM(t.amount), 0)::numeric(18, 4)::text AS total
          FROM transfer t
          WHERE t.org_id = ${orgId}
            AND t.purpose = 'regularization'
            AND t.reverses_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM transfer reversal
              WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id
            )
          GROUP BY t.regularizes_kind, t.regularizes_id
        `);
        const coverageRows = Array.isArray(coverageResult) ? coverageResult : coverageResult.rows ?? [];
        const coverage = new Map(coverageRows.map((row) => [`${row.regularizesKind}:${row.regularizesId}`, row.total]));
        return rows.map((row) => ({
          ...row,
          remaining: remainingMoney(String(row.amount), coverage.get(`${row.sourceKind}:${row.id}`) ?? "0.0000"),
        })) as PendingDeposit[];
      });
    },

    async listMemberDeposits(orgId, memberId) {
      return withTenantTransaction(orgId, async (tx) => {
        const result = await tx.execute(sql`
          SELECT source.id,
                 source.kind AS "sourceKind",
                 source.amount::numeric(18, 4)::text AS amount,
                 source.currency_code AS "currencyCode",
                 source.dated_on::text AS "datedOn",
                 source.account_id AS "accountId",
                 a.name AS "accountName",
                 source.member_id AS "memberId",
                 m.display_name AS "memberName",
                 source.notes,
                 source.reconciliation_status AS "reconciliationStatus",
                 ${orgId}::uuid AS "orgId"
          FROM (
            SELECT id, 'contribution'::text AS kind, amount, currency_code, dated_on,
                   account_id, member_id, notes, reconciliation_status, reverses_id
            FROM contribution WHERE org_id = ${orgId} AND member_id = ${memberId}
            UNION ALL
            SELECT id, 'repayment'::text AS kind, amount, currency_code, dated_on,
                   account_id, member_id, notes, reconciliation_status, reverses_id
            FROM repayment WHERE org_id = ${orgId} AND member_id = ${memberId}
          ) source
          JOIN member m ON m.id = source.member_id AND m.org_id = ${orgId}
          LEFT JOIN account a ON a.id = source.account_id AND a.org_id = ${orgId}
          WHERE source.reverses_id IS NULL
          ORDER BY source.dated_on DESC, source.kind, source.id
        `);
        return (Array.isArray(result) ? result : result.rows ?? []) as DepositStatus[];
      });
    },

    async isExpenseSlipUriReferenced(orgId, uri) {
      return withTenantTransaction(orgId, async (tx) => {
        const [referenced] = await tx.select({ id: slipPhoto.id }).from(slipPhoto).where(and(
          eq(slipPhoto.orgId, orgId),
          eq(slipPhoto.uri, uri),
        )).limit(1);
        return Boolean(referenced);
      });
    },

    async recordBlobCleanupRequired(input) {
      const timestamp = now();
      await withWritableTenantTransaction(input.orgId, async (tx) => {
        await tx.insert(alert).values({
          orgId: input.orgId,
          alertKind: "blob_cleanup_required",
          severity: "high",
          audience: "treasurer",
          subjectKind: "expense_slip",
          subjectId: deterministicUuid(["blob-cleanup", input.orgId, input.uri]),
          payload: {
            uri: input.uri,
            contentHash: input.contentHash,
            reason: input.reason,
            actorId: input.actorId,
          },
          dedupWindowEnd: new Date(timestamp.getTime() + 24 * 60 * 60 * 1_000),
          createdAt: timestamp,
        }).onConflictDoNothing();
      });
    },

    async recordExpense(input) {
      const category = assertExpenseCategory(input.category);
      if (category === "solidarity_payout" || category === "treasurer_comp_payout") {
        throw new Error("movement_governed_payout_required");
      }
      const amount = parsePositiveMoney4(input.amount);
      const datedOn = assertDateOnly(input.datedOn);
      const notes = normalizedNotes(input.notes);
      assertExpenseSlip(input);
      const command = {
        orgId: input.orgId,
        accountId: input.accountId,
        category,
        amount,
        currencyCode: "USD",
        datedOn,
        notes,
        purpose: category,
      } as const;

      const outcome = await withWritableTenantTransaction(input.orgId, async (tx) => {
        const assertEquivalentReplay = async (replayed: ExpenseRow): Promise<ExpenseRow> => {
          let slipMatches = replayed.slipPhotoId === null && !input.slipPhoto;
          if (input.slipPhoto && replayed.slipPhotoId) {
            const [replayedSlip] = await tx.select().from(slipPhoto).where(and(
              eq(slipPhoto.orgId, input.orgId),
              eq(slipPhoto.id, replayed.slipPhotoId),
            )).limit(1);
            slipMatches = Boolean(
              replayedSlip
              && replayedSlip.contentHash === input.slipPhoto.contentHash
              && replayedSlip.mimeType === input.slipPhoto.mimeType
              && replayedSlip.byteSize === input.slipPhoto.byteSize,
            );
          }
          if (
            replayed.orgId !== command.orgId
            || replayed.createdBy !== input.actorId
            || replayed.accountId !== command.accountId
            || replayed.category !== command.category
            || String(replayed.amount) !== command.amount
            || replayed.currencyCode !== command.currencyCode
            || String(replayed.incurredOn) !== command.datedOn
            || replayed.purpose !== command.purpose
            || replayed.notes !== command.notes
            || replayed.status !== "paid"
            || !slipMatches
          ) {
            throw new Error("movement_idempotency_conflict");
          }
          return replayed;
        };

        const [replayed] = await tx.select().from(expense).where(and(
          eq(expense.orgId, input.orgId),
          eq(expense.clientRequestId, input.clientRequestId),
        )).limit(1);
        if (replayed) {
          return { saved: await assertEquivalentReplay(replayed), inserted: false };
        }

        const [anyGroupAccount] = await tx.select({ id: account.id }).from(account).where(and(
          eq(account.orgId, input.orgId),
          eq(account.status, "active"),
          eq(account.isGroupFund, true),
        )).limit(1);
        if (!anyGroupAccount) throw new Error("movement_group_account_required");

        const [selectedAccount] = await tx.select().from(account).where(and(
          eq(account.orgId, input.orgId),
          eq(account.id, input.accountId),
          eq(account.status, "active"),
          eq(account.isGroupFund, true),
        )).for("update").limit(1);
        if (!selectedAccount) throw new Error("movement_account_unavailable");

        const timestamp = now();
        const expenseId = deterministicUuid(["expense", input.orgId, input.clientRequestId]);
        let slipPhotoId: string | null = null;
        if (input.slipPhoto) {
          slipPhotoId = deterministicUuid(["expense-slip", input.orgId, input.clientRequestId]);
          await tx.insert(slipPhoto).values({
            id: slipPhotoId,
            orgId: input.orgId,
            uri: input.slipPhoto.uri,
            mimeType: input.slipPhoto.mimeType,
            byteSize: input.slipPhoto.byteSize,
            contentHash: input.slipPhoto.contentHash,
            attachedToKind: "expense",
            attachedToId: expenseId,
            uploadedAt: timestamp,
            uploadedBy: input.actorId,
            uploadedByKind: "member",
          }).onConflictDoNothing();
          const [persistedSlip] = await tx.select().from(slipPhoto).where(and(
            eq(slipPhoto.id, slipPhotoId),
            eq(slipPhoto.orgId, input.orgId),
          )).limit(1);
          if (
            !persistedSlip
            || persistedSlip.attachedToId !== expenseId
            || persistedSlip.attachedToKind !== "expense"
            || persistedSlip.contentHash !== input.slipPhoto.contentHash
            || persistedSlip.mimeType !== input.slipPhoto.mimeType
            || persistedSlip.byteSize !== input.slipPhoto.byteSize
          ) {
            throw new Error("movement_idempotency_conflict");
          }
        }
        let [saved] = await tx.insert(expense).values({
          id: expenseId,
          orgId: input.orgId,
          purpose: category,
          notes,
          amount,
          currencyCode: "USD",
          beneficiaryMemberId: null,
          beneficiaryText: null,
          incurredOn: datedOn,
          status: "paid",
          recordedAt: timestamp,
          reversesId: null,
          reverseReason: null,
          adjustmentCycleId: null,
          accountId: selectedAccount.id,
          category,
          clientRequestId: input.clientRequestId,
          slipPhotoId,
          createdAt: timestamp,
          createdBy: input.actorId,
          createdByKind: "member",
        }).onConflictDoNothing({
          target: [expense.orgId, expense.clientRequestId],
        }).returning();
        if (!saved) {
          [saved] = await tx.select().from(expense).where(and(
            eq(expense.orgId, input.orgId),
            eq(expense.clientRequestId, input.clientRequestId),
          )).limit(1);
          if (saved) return { saved: await assertEquivalentReplay(saved), inserted: false };
          throw new Error("movement_expense_not_saved");
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "movement.expense",
          subjectKind: "expense",
          subjectId: saved.id,
          payloadSnapshot: {
            accountId: selectedAccount.id,
            category,
            amount,
            currencyCode: "USD",
            datedOn,
            notes,
            slipPhotoId: saved.slipPhotoId,
            clientRequestId: input.clientRequestId,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });
        return { saved, inserted: true };
      });
      return outcome.saved;
    },

    async recordTransfer(input) {
      if (input.fromAccountId === input.toAccountId) throw new Error("transfer_accounts_must_differ");
      const amount = parsePositiveMoney4(input.amount);
      const datedOn = assertDateOnly(input.datedOn);
      const notes = normalizedNotes(input.notes);
      const command = {
        orgId: input.orgId,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount,
        currencyCode: "USD",
        datedOn,
        purpose: "transfer",
        notes,
      } as const;

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const assertEquivalentReplay = (replayed: TransferRow): TransferRow => {
          if (
            replayed.orgId !== command.orgId
            || replayed.createdBy !== input.actorId
            || replayed.fromAccountId !== command.fromAccountId
            || replayed.toAccountId !== command.toAccountId
            || String(replayed.amount) !== command.amount
            || replayed.currencyCode !== command.currencyCode
            || String(replayed.datedOn) !== command.datedOn
            || replayed.purpose !== command.purpose
            || replayed.notes !== command.notes
            || replayed.slipPhotoId !== null
          ) {
            throw new Error("movement_idempotency_conflict");
          }
          return replayed;
        };
        const [replayed] = await tx.select().from(transfer).where(and(
          eq(transfer.orgId, input.orgId),
          eq(transfer.clientRequestId, input.clientRequestId),
        )).limit(1);
        if (replayed) return assertEquivalentReplay(replayed);

        const accounts = await tx.select().from(account).where(and(
          eq(account.orgId, input.orgId),
          inArray(account.id, [input.fromAccountId, input.toAccountId]),
        )).for("update");
        const from = accounts.find((row) => row.id === input.fromAccountId);
        const to = accounts.find((row) => row.id === input.toAccountId);
        if (!from || !to || from.status !== "active" || to.status !== "active" || !from.isGroupFund || !to.isGroupFund) {
          throw new Error("transfer_account_unavailable");
        }
        assertTransferAccounts({ from, to });
        if (transferFundDelta({ from, to, amount }) !== "0.0000") {
          throw new Error("transfer_fund_delta_invalid");
        }

        const timestamp = now();
        let [saved] = await tx.insert(transfer).values({
          orgId: input.orgId,
          fromAccountId: from.id,
          toAccountId: to.id,
          amount,
          currencyCode: "USD",
          datedOn,
          purpose: "transfer",
          notes,
          regularizesKind: null,
          regularizesId: null,
          clientRequestId: input.clientRequestId,
          slipPhotoId: null,
          reversesId: null,
          createdAt: timestamp,
          createdBy: input.actorId,
        }).onConflictDoNothing().returning();
        if (!saved) {
          [saved] = await tx.select().from(transfer).where(and(
            eq(transfer.orgId, input.orgId),
            eq(transfer.clientRequestId, input.clientRequestId),
          )).limit(1);
          if (saved) return assertEquivalentReplay(saved);
          throw new Error("movement_transfer_not_saved");
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "movement.transfer",
          subjectKind: "transfer",
          subjectId: saved.id,
          payloadSnapshot: {
            fromAccountId: from.id,
            toAccountId: to.id,
            amount,
            currencyCode: "USD",
            datedOn,
            purpose: "transfer",
            notes,
            clientRequestId: input.clientRequestId,
            fundDelta: "0.0000",
            accountDeltas: transferAccountDeltas({ from, to, amount }),
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });
        return saved;
      });
    },

    async regularizePendingDeposit(input) {
      const amount = parsePositiveMoney4(input.amount);
      const datedOn = assertDateOnly(input.datedOn);
      const notes = normalizedNotes(input.notes);

      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const assertEquivalentReplay = (replayed: TransferRow): TransferRow => {
          if (
            replayed.orgId !== input.orgId
            || replayed.createdBy !== input.actorId
            || replayed.toAccountId !== input.toAccountId
            || String(replayed.amount) !== amount
            || replayed.currencyCode !== "USD"
            || String(replayed.datedOn) !== datedOn
            || replayed.purpose !== "regularization"
            || replayed.regularizesKind !== input.regularizesKind
            || replayed.regularizesId !== input.regularizesId
            || replayed.notes !== notes
            || replayed.slipPhotoId !== null
          ) {
            throw new Error("movement_idempotency_conflict");
          }
          return replayed;
        };
        const replayOutcome = async () => {
          const [replayed] = await tx.select().from(transfer).where(and(
            eq(transfer.orgId, input.orgId),
            eq(transfer.clientRequestId, input.clientRequestId),
          )).limit(1);
          if (!replayed) return undefined;
          assertEquivalentReplay(replayed);
          const [audit] = await tx.select({ payloadSnapshot: auditLogEntry.payloadSnapshot })
            .from(auditLogEntry).where(and(
              eq(auditLogEntry.orgId, input.orgId),
              eq(auditLogEntry.actionKind, "movement.regularization"),
              eq(auditLogEntry.subjectKind, "transfer"),
              eq(auditLogEntry.subjectId, replayed.id),
            )).limit(1);
          const snapshot = audit?.payloadSnapshot as { coverage?: unknown; regularized?: unknown } | null | undefined;
          if (typeof snapshot?.coverage !== "string" || typeof snapshot.regularized !== "boolean") {
            throw new Error("regularization_replay_outcome_missing");
          }
          const [sourceAmount] = input.regularizesKind === "contribution"
            ? await tx.select({ amount: contribution.amount }).from(contribution).where(and(
              eq(contribution.orgId, input.orgId), eq(contribution.id, input.regularizesId),
            )).limit(1)
            : await tx.select({ amount: repayment.amount }).from(repayment).where(and(
              eq(repayment.orgId, input.orgId), eq(repayment.id, input.regularizesId),
            )).limit(1);
          return {
            transfer: replayed,
            coverage: snapshot.coverage,
            remaining: remainingMoney(String(sourceAmount?.amount ?? snapshot.coverage), snapshot.coverage),
            regularized: snapshot.regularized,
          };
        };

        const earlyReplay = await replayOutcome();
        if (earlyReplay) return earlyReplay;

        const sourceRows = input.regularizesKind === "contribution"
          ? await tx.select({
            id: contribution.id,
            orgId: contribution.orgId,
            accountId: contribution.accountId,
            amount: contribution.amount,
            reconciliationStatus: contribution.reconciliationStatus,
          }).from(contribution).where(and(
            eq(contribution.orgId, input.orgId),
            eq(contribution.id, input.regularizesId),
            isNull(contribution.reversesId),
          )).for("update").limit(1)
          : await tx.select({
            id: repayment.id,
            orgId: repayment.orgId,
            accountId: repayment.accountId,
            amount: repayment.amount,
            reconciliationStatus: repayment.reconciliationStatus,
          }).from(repayment).where(and(
            eq(repayment.orgId, input.orgId),
            eq(repayment.id, input.regularizesId),
            isNull(repayment.reversesId),
          )).for("update").limit(1);
        const source = sourceRows[0];
        if (!source?.accountId) throw new Error("regularization_source_unavailable");
        const replayAfterLock = await replayOutcome();
        if (replayAfterLock) return replayAfterLock;
        if (source.reconciliationStatus === "regularized") {
          throw new Error("regularization_source_already_regularized");
        }

        const accounts = await tx.select().from(account).where(and(
          eq(account.orgId, input.orgId),
          inArray(account.id, [source.accountId, input.toAccountId]),
        )).for("update");
        const from = accounts.find((row) => row.id === source.accountId);
        const to = accounts.find((row) => row.id === input.toAccountId);
        if (!from || from.isGroupFund) throw new Error("regularization_source_unavailable");
        if (!to || !to.isGroupFund || to.status !== "active") throw new Error("regularization_target_unavailable");

        const [priorCoverageRow] = await tx.select({
          total: sql<string>`COALESCE(SUM(${transfer.amount}), 0)::numeric(18, 4)::text`,
        }).from(transfer).where(and(
          eq(transfer.orgId, input.orgId),
          eq(transfer.purpose, "regularization"),
          eq(transfer.regularizesKind, input.regularizesKind),
          eq(transfer.regularizesId, input.regularizesId),
          isNull(transfer.reversesId),
          sql`NOT EXISTS (
            SELECT 1 FROM transfer reversal
            WHERE reversal.org_id = ${transfer.orgId} AND reversal.reverses_id = ${transfer.id}
          )`,
        ));
        const priorCoverage = String(priorCoverageRow?.total ?? "0.0000");
        const remainingBefore = remainingMoney(String(source.amount), priorCoverage);
        if (signedMoneyUnits(amount) > signedMoneyUnits(remainingBefore)) {
          throw new Error("regularization_amount_exceeds_remaining");
        }

        let [saved] = await tx.insert(transfer).values({
            orgId: input.orgId,
            fromAccountId: from.id,
            toAccountId: to.id,
            amount,
            currencyCode: "USD",
            datedOn,
            purpose: "regularization",
            notes,
            regularizesKind: input.regularizesKind,
            regularizesId: input.regularizesId,
            clientRequestId: input.clientRequestId,
            slipPhotoId: null,
            reversesId: null,
            createdAt: now(),
            createdBy: input.actorId,
          }).onConflictDoNothing().returning();
        if (!saved) {
          const concurrentReplay = await replayOutcome();
          if (concurrentReplay) return concurrentReplay;
          throw new Error("movement_transfer_not_saved");
        }

        const [coverageRow] = await tx.select({
          total: sql<string>`COALESCE(SUM(${transfer.amount}), 0)::numeric(18, 4)::text`,
        }).from(transfer).where(and(
          eq(transfer.orgId, input.orgId),
          eq(transfer.purpose, "regularization"),
          eq(transfer.regularizesKind, input.regularizesKind),
          eq(transfer.regularizesId, input.regularizesId),
          isNull(transfer.reversesId),
          sql`NOT EXISTS (
            SELECT 1 FROM transfer reversal
            WHERE reversal.org_id = ${transfer.orgId} AND reversal.reverses_id = ${transfer.id}
          )`,
        ));
        const coverage = String(coverageRow?.total ?? "0.0000");
        const remaining = remainingMoney(String(source.amount), coverage);
        const regularized = shouldMarkRegularized({ sourceAmount: String(source.amount), regularizedAmount: coverage });
        if (regularized && source.reconciliationStatus === "pending") {
          if (input.regularizesKind === "contribution") {
            await tx.update(contribution).set({ reconciliationStatus: "regularized" }).where(and(
              eq(contribution.orgId, input.orgId),
              eq(contribution.id, input.regularizesId),
              eq(contribution.reconciliationStatus, "pending"),
            ));
          } else {
            await tx.update(repayment).set({ reconciliationStatus: "regularized" }).where(and(
              eq(repayment.orgId, input.orgId),
              eq(repayment.id, input.regularizesId),
              eq(repayment.reconciliationStatus, "pending"),
            ));
          }
        }
        const timestamp = now();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "movement.regularization",
          subjectKind: "transfer",
          subjectId: saved.id,
          payloadSnapshot: {
            fromAccountId: from.id,
            toAccountId: to.id,
            amount,
            currencyCode: "USD",
            datedOn,
            notes,
            regularizesKind: input.regularizesKind,
            regularizesId: input.regularizesId,
            clientRequestId: input.clientRequestId,
            fundDelta: amount,
            coverage,
            remaining,
            regularized,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });
        return { transfer: saved, coverage, remaining, regularized };
      });
    },
  };
}
