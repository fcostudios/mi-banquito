import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createMemberStatementService,
  type MonthlyMemberStatementArtifactInput,
  type MonthlyMemberStatementArtifactResult,
} from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";
import messages from "@/lib/i18n/en-US.json";
import { ROUTE_SCR_MEMBER_DETAIL, ROUTE_SCR_STATEMENTS_ARCHIVE } from "@/lib/routes";

const generateStatementsSchema = z.object({
  periodCloseId: z.string().uuid(),
  memberId: z.string().uuid().optional(),
  returnTo: z.string().max(500).optional(),
}).strict();

type CreateArtifact = (
  input: MonthlyMemberStatementArtifactInput,
) => Promise<MonthlyMemberStatementArtifactResult>;

function scalarFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  const allowed = new Set(keys);
  const values: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (!allowed.has(key) && !key.startsWith("$ACTION_")) throw new z.ZodError([]);
  }
  for (const key of keys) {
    const entries = formData.getAll(key);
    if (entries.length > 1 || (entries[0] !== undefined && typeof entries[0] !== "string")) {
      throw new z.ZodError([]);
    }
    if (entries[0] !== undefined) values[key] = entries[0];
  }
  return values;
}

export async function executeGenerateMemberStatementsAction(
  formData: FormData,
  createArtifact: CreateArtifact,
  deleteArtifact?: (artifact: MonthlyMemberStatementArtifactResult) => Promise<void>,
) {
  const session = await requireTreasurer();
  const parsed = generateStatementsSchema.parse(scalarFields(formData, ["periodCloseId", "memberId", "returnTo"]));
  await createMemberStatementService().generate({
    orgId: session.orgId,
    actorId: session.actorId,
    periodCloseId: parsed.periodCloseId,
    memberId: parsed.memberId,
    statementCopy: messages.statementPdf.monthlyMember,
    createArtifact,
    deleteArtifact,
  });
  revalidatePath(ROUTE_SCR_STATEMENTS_ARCHIVE);
  const expectedReturnTo = parsed.memberId
    ? `${ROUTE_SCR_MEMBER_DETAIL.replace("[id]", parsed.memberId)}?estado=generado`
    : undefined;
  if (expectedReturnTo && parsed.returnTo === expectedReturnTo) {
    revalidatePath(parsed.returnTo.split("?")[0] || "/");
    redirect(parsed.returnTo);
  }
}
