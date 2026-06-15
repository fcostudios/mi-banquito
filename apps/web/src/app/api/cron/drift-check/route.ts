import { createCronHandler } from "@/lib/cron/handler";

export const runtime = "nodejs";

export const GET = createCronHandler("drift-check");
