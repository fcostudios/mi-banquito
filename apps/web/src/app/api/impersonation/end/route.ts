import { NextRequest, NextResponse } from "next/server";
import { createImpersonationService } from "@mi-banquito/domain";
import { auth0 } from "@/lib/auth0";
import { createEndImpersonationHandler } from "./handler";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return createEndImpersonationHandler({
    getSession: (incoming) => auth0.getSession(incoming),
    service: createImpersonationService(),
    secret: process.env.IMPERSONATION_COOKIE_SECRET ?? "",
    now: () => new Date(),
  })(request);
}
