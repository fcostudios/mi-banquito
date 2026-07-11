import { and, asc, eq, sql } from "drizzle-orm";

import { account, auditLogEntry } from "@mi-banquito/db/schema";
import { withTenantTransaction, withWritableTenantTransaction } from "@mi-banquito/db/tenant";

export const ACCOUNT_TYPES = [
  "group_bank",
  "cash_box",
  "treasurer_personal",
  "external",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountRow = typeof account.$inferSelect;

export type AccountInput = {
  name: string;
  type: AccountType;
  isGroupFund?: boolean;
  last4?: string | null;
};

export type SaveAccountInput = AccountInput & {
  id?: string;
  orgId: string;
  actorId: string;
  clientRequestId: string;
};

export type DeactivateAccountInput = {
  id: string;
  orgId: string;
  actorId: string;
};

export interface AccountsService {
  readonly context: "accounts";
  listAccounts(orgId: string): Promise<AccountRow[]>;
  saveAccount(input: SaveAccountInput): Promise<AccountRow>;
  deactivateAccount(input: DeactivateAccountInput): Promise<AccountRow>;
}

export function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPES.some((type) => type === value);
}

export function defaultIsGroupFund(type: AccountType): boolean {
  return type === "group_bank" || type === "cash_box";
}

export function normalizeAccountInput(input: AccountInput): Required<Omit<AccountInput, "last4">> & { last4: string | null } {
  const name = input.name.trim();
  if (!name) {
    throw new Error("account_name_required");
  }
  if (input.last4 !== undefined && input.last4 !== null && input.last4 !== "" && !/^\d{4}$/.test(input.last4)) {
    throw new Error("account_last4_invalid");
  }

  return {
    name,
    type: input.type,
    isGroupFund: input.isGroupFund ?? defaultIsGroupFund(input.type),
    last4: input.last4 || null,
  };
}

export function hasActiveGroupFundAccount(
  rows: ReadonlyArray<Pick<AccountRow, "isGroupFund" | "status">>,
): boolean {
  return rows.some((row) => row.status === "active" && row.isGroupFund);
}

export function createAccountsService(options: { now?: () => Date } = {}): AccountsService {
  const now = options.now ?? (() => new Date());

  return {
    context: "accounts",

    async listAccounts(orgId) {
      return withTenantTransaction(orgId, (tx) => tx.select()
        .from(account)
        .where(eq(account.orgId, orgId))
        .orderBy(asc(account.name), asc(account.id)));
    },

    async saveAccount(input) {
      const values = normalizeAccountInput(input);
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const timestamp = now();
        const [historicalReplay] = await tx.select({ subjectId: auditLogEntry.subjectId })
          .from(auditLogEntry)
          .where(and(
            eq(auditLogEntry.orgId, input.orgId),
            eq(auditLogEntry.subjectKind, "account"),
            sql`${auditLogEntry.payloadSnapshot}->>'clientRequestId' = ${input.clientRequestId}`,
          ))
          .limit(1);
        if (historicalReplay?.subjectId) {
          const [historicalAccount] = await tx.select().from(account).where(and(
            eq(account.orgId, input.orgId),
            eq(account.id, historicalReplay.subjectId),
          )).limit(1);
          if (historicalAccount) {
            if (input.id && historicalAccount.id !== input.id) {
              throw new Error("account_idempotency_conflict");
            }
            return historicalAccount;
          }
        }
        const [replayed] = await tx.select().from(account).where(and(
          eq(account.orgId, input.orgId),
          eq(account.clientRequestId, input.clientRequestId),
        )).limit(1);
        if (replayed) {
          if (input.id && replayed.id !== input.id) {
            throw new Error("account_idempotency_conflict");
          }
          return replayed;
        }

        let saved: AccountRow | undefined;
        if (input.id) {
          const [target] = await tx.select().from(account).where(and(
            eq(account.id, input.id),
            eq(account.orgId, input.orgId),
          )).for("update").limit(1);
          if (!target) {
            throw new Error("account_not_found");
          }
          if (target.clientRequestId === input.clientRequestId) {
            return target;
          }
          [saved] = await tx.update(account).set({
            ...values,
            clientRequestId: input.clientRequestId,
          }).where(and(
            eq(account.id, input.id),
            eq(account.orgId, input.orgId),
          )).returning();
        } else {
          [saved] = await tx.insert(account).values({
              ...values,
              orgId: input.orgId,
              clientRequestId: input.clientRequestId,
              status: "active",
              createdAt: timestamp,
              createdBy: input.actorId,
            }).onConflictDoNothing({
              target: [account.orgId, account.clientRequestId],
            }).returning();
          if (!saved) {
            [saved] = await tx.select().from(account).where(and(
              eq(account.orgId, input.orgId),
              eq(account.clientRequestId, input.clientRequestId),
            )).limit(1);
            if (saved) return saved;
          }
        }

        if (!saved) {
          throw new Error("account_not_found");
        }

        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: input.id ? "account.update" : "account.create",
          subjectKind: "account",
          subjectId: saved.id,
          payloadSnapshot: {
            id: saved.id,
            name: saved.name,
            type: saved.type,
            isGroupFund: saved.isGroupFund,
            last4: saved.last4,
            status: saved.status,
            clientRequestId: saved.clientRequestId,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });

        return saved;
      });
    },

    async deactivateAccount(input) {
      return withWritableTenantTransaction(input.orgId, async (tx) => {
        const [existing] = await tx.select().from(account).where(and(
          eq(account.id, input.id),
          eq(account.orgId, input.orgId),
        )).for("update").limit(1);

        if (!existing) {
          throw new Error("account_not_found");
        }
        if (existing.status === "archived") {
          return existing;
        }
        const [archived] = await tx.update(account).set({ status: "archived" }).where(and(
          eq(account.id, input.id),
          eq(account.orgId, input.orgId),
          eq(account.status, "active"),
        )).returning();
        if (!archived) throw new Error("account_not_found");

        const timestamp = now();
        await tx.insert(auditLogEntry).values({
          orgId: input.orgId,
          actorKind: "member",
          actorId: input.actorId,
          actionKind: "account.archive",
          subjectKind: "account",
          subjectId: archived.id,
          payloadSnapshot: {
            id: archived.id,
            name: archived.name,
            type: archived.type,
            isGroupFund: archived.isGroupFund,
            last4: archived.last4,
            status: archived.status,
            clientRequestId: archived.clientRequestId,
          },
          reason: null,
          at: timestamp,
          createdAt: timestamp,
        });

        return archived;
      });
    },
  };
}
