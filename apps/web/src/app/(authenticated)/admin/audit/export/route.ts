import { NextResponse } from "next/server";
import { auditRowsToCsv, createAdminAuditService } from "@mi-banquito/domain";

import { auditFiltersFromSearchParams } from "@/lib/admin-audit-query";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function GET(request: Request) {
  await requirePlatformOperator();
  const url = new URL(request.url);
  let filters;
  try {
    filters = auditFiltersFromSearchParams(Object.fromEntries(url.searchParams.entries()));
  } catch {
    return NextResponse.json({ error: "invalid_filters" }, { status: 400 });
  }
  const { cursor: _cursor, limit: _limit, ...exportFilters } = filters;
  const rows = await createAdminAuditService().listAll(exportFilters);
  return new NextResponse(auditRowsToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="audit-log.csv"',
      "cache-control": "private, no-store",
    },
  });
}
