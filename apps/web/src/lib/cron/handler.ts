import { NextResponse } from "next/server";

export type CronJobName =
  | "accrue-interest"
  | "award-treasurer-compensation"
  | "daily"
  | "drift-check";

export function createCronHandler(job: CronJobName) {
  return async function GET(request: Request) {
    const expected = process.env.CRON_SECRET;
    const auth = request.headers.get("authorization");

    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ job, ran: true });
  };
}
