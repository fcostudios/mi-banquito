import { sql } from "drizzle-orm";
import { db } from "./index";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const TENANT_SESSION_KEY = "app.current_org_id";

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
