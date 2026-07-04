import { NextResponse } from "next/server";
import { verifyHashSchema } from "@mi-banquito/contracts";
import { createReportingService } from "@mi-banquito/domain";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const parsed = verifyHashSchema.safeParse(hash);
  if (!parsed.success) {
    return NextResponse.json({ matched: false }, { status: 400 });
  }

  const result = await createReportingService().verifyStatementHash(parsed.data.toLowerCase());
  return NextResponse.json(result, { status: result.matched ? 200 : 404 });
}
