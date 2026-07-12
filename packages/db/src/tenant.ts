import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { organization } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  return withTenantTransaction(orgId, async (tx) => {
    await assertTenantWritable(tx, orgId);
    return run(tx);
  });
}
