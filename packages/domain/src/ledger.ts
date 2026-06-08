// Ledger domain — typed service boundary. TEMPLATE — one shape of
// many; the dev team owns the real bodies. This is IMP-268's worked example for
// the central seam db -> contracts -> domain -> action/read -> ui. Consumes
// @mi-banquito/db; its input type aligns with @mi-banquito/contracts' insertMemberSchema
// (validated at the action edge, so this layer stays Zod-free). Member is the
// salient entity (most screen-referenced, org-scoped) for this project.
import { and, eq } from "drizzle-orm";
import { db } from "@mi-banquito/db";
import { member } from "@mi-banquito/db/schema";

// Row/input types are named for the ENTITY, not the context — a context owns
// many entities, so the dev team's next method (e.g. listContributions) defines
// its own ContributionRow alongside these.
export type MemberRow = typeof member.$inferSelect;
export type NewMemberInput = Omit<typeof member.$inferInsert, "orgId">;

export interface LedgerService {
  readonly context: "ledger";
  /** Read spine: org-scoped list (a force-dynamic Server Component calls this). */
  listMembers(orgId: string): Promise<MemberRow[]>;
  /** Read by id: org-scoped single row (a dynamic-route detail page calls this). */
  getMember(orgId: string, id: string): Promise<MemberRow | undefined>;
  /** Mutation: insert a validated row. The tenant is supplied separately (from the
   *  session), never by the caller's input. */
  createMember(orgId: string, input: NewMemberInput): Promise<MemberRow>;
}

export const createLedgerService = (): LedgerService => ({
  context: "ledger",
  async listMembers(orgId) {
    return db.select().from(member).where(eq(member.orgId, orgId));
  },
  async getMember(orgId, id) {
    // org_id ALWAYS in the where — a row id alone never crosses tenants.
    const [row] = await db.select().from(member)
      .where(and(eq(member.orgId, orgId), eq(member.id, id)));
    return row;
  },
  async createMember(orgId, input) {
    const [row] = await db.insert(member).values({ ...input, orgId }).returning();
    return row;
  },
});
