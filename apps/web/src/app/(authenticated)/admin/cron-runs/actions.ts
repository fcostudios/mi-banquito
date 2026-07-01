"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requirePlatformOperator } from "@/lib/auth/require-session";
import { db } from "@mi-banquito/db";
import { auditLogEntry } from "@mi-banquito/db/schema";

const replaySchema = z.object({
  endpoint: z.enum([
    "/api/cron/accrue-interest",
    "/api/cron/award-treasurer-compensation",
    "/api/cron/daily",
    "/api/cron/drift-check",
  ]),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((value) => value.from_date <= value.to_date, {
  message: "from_date must be on or before to_date",
  path: ["from_date"],
});

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function currentOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function replayCronRun(formData: FormData) {
  const operator = await requirePlatformOperator();
  const parsed = replaySchema.parse({
    endpoint: formValue(formData, "endpoint"),
    from_date: formValue(formData, "from_date"),
    to_date: formValue(formData, "to_date"),
  });
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET is required to replay cron runs");
  }

  const url = new URL(parsed.endpoint, await currentOrigin());
  url.searchParams.set("from_date", parsed.from_date);
  url.searchParams.set("to_date", parsed.to_date);

  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Cron replay failed with status ${response.status}`);
  }

  const now = new Date();
  await db.insert(auditLogEntry).values({
    orgId: null,
    actorKind: "platform_operator",
    actorId: operator.actorId,
    actionKind: "cron.replayed",
    subjectKind: "cron_run",
    subjectId: null,
    payloadSnapshot: {
      endpoint: parsed.endpoint,
      fromDate: parsed.from_date,
      toDate: parsed.to_date,
      result,
    },
    reason: null,
    at: now,
    createdAt: now,
  });

  revalidatePath("/admin/cron-runs");
}
