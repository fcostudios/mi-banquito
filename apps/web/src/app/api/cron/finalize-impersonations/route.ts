import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createImpersonationService } from "@mi-banquito/domain";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const finalized = await createImpersonationService().sweepExpired();
  return NextResponse.json({ job: "finalize-impersonations", finalized });
}
