"use server";

import { revalidatePath } from "next/cache";
import { createAlertsService } from "@mi-banquito/domain";
import { requireTreasurer } from "@/lib/auth/require-session";

function sevenDaysFromNow() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 7);
  return value;
}

function revalidateShell() {
  revalidatePath("/", "layout");
}

export async function dismissAlertAction(formData: FormData) {
  const session = await requireTreasurer();
  const alertId = String(formData.get("alertId") ?? "");
  if (!alertId) {
    return;
  }

  await createAlertsService().dismissAlert({
    orgId: session.orgId,
    alertId,
    actorId: session.actorId,
    audience: "treasurer",
  });
  revalidateShell();
}

export async function snoozeAlertAction(formData: FormData) {
  const session = await requireTreasurer();
  const alertId = String(formData.get("alertId") ?? "");
  if (!alertId) {
    return;
  }

  await createAlertsService().snoozeAlert({
    orgId: session.orgId,
    alertId,
    actorId: session.actorId,
    audience: "treasurer",
    snoozedUntil: sevenDaysFromNow(),
  });
  revalidateShell();
}
