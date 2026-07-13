import { NextResponse } from "next/server";
import { auditRowsToCsvStream, createAdminAuditService } from "@mi-banquito/domain";

import { parseAdminAuditFilters } from "@/lib/admin-audit-query";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function GET(request: Request) {
  await requirePlatformOperator();
  const url = new URL(request.url);
  const parsed = parseAdminAuditFilters(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const filters = parsed.filters;
  const { cursor: _cursor, limit: _limit, ...exportFilters } = filters;
  const rows = createAdminAuditService().iterate(exportFilters);
  return new NextResponse(auditRowsToCsvStream(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="audit-log.csv"',
      "cache-control": "private, no-store",
    },
  });
}
