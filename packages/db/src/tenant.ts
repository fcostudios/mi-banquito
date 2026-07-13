import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { getTenantRequestContext } from "./request-context";
import { organization } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SystemTenantOperation =
  | "impersonation_expiration"
  | "monthly_close_artifact_maintenance";

export type ImpersonationLifecycleOperation = "start" | "end";

export type PlatformOperation =
  | "admin_drift_persistence"
  | "organization_provisioning"
  | "organization_provider_binding"
  | "organization_lifecycle";

type OperationContext<T extends string> = {
  operation: T;
  reason: string;
};

const SYSTEM_TENANT_OPERATIONS: ReadonlySet<SystemTenantOperation> = new Set([
  "impersonation_expiration",
  "monthly_close_artifact_maintenance",
]);

export const TENANT_SESSION_KEY = "app.current_org_id";

export async function lockTenantMoneyWrites(tx: Transaction, orgId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-money:${orgId}`}, 0))`);
}

export async function withTenantTransaction<T>(
  orgId: string,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config(${TENANT_SESSION_KEY}, ${orgId}, true)`,
    );
    return run(tx);
  });
}

export async function assertTenantWritable(tx: Transaction, orgId: string): Promise<void> {
  const [org] = await tx
    .select({ status: organization.status })
    .from(organization)
    .where(eq(organization.id, orgId));

  if (!org || org.status !== "active") {
    throw new Error("organization_not_writable");
  }
}

export async function withWritableTenantTransaction<T>(
  orgId: string,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const context = getTenantRequestContext();
  if (context.readOnly) {
    throw new Error("impersonation_read_only");
  }
  if (context.orgId && context.orgId !== orgId) {
    throw new Error("tenant_request_context_mismatch");
  }
  return withTenantTransaction(orgId, async (tx) => {
    await assertTenantWritable(tx, orgId);
    return run(tx);
  });
}

function requireOperationReason(reason: string): void {
  if (!reason.trim()) throw new Error("transaction_operation_reason_required");
}

export async function withSystemTenantTransaction<T>(
  orgId: string,
  context: OperationContext<SystemTenantOperation>,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  requireOperationReason(context.reason);
  if (!SYSTEM_TENANT_OPERATIONS.has(context.operation)) {
    throw new Error("system_tenant_operation_not_allowed");
  }
  return withTenantTransaction(orgId, run);
}

export async function withImpersonationLifecycleTransaction<T>(
  orgId: string,
  context: OperationContext<ImpersonationLifecycleOperation>,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  requireOperationReason(context.reason);
  return withTenantTransaction(orgId, run);
}

export async function withPlatformTransaction<T>(
  context: OperationContext<PlatformOperation>,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  requireOperationReason(context.reason);
  return db.transaction(run);
}
