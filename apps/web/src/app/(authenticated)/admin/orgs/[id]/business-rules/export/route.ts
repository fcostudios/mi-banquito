import { NextResponse } from "next/server";
import { createPlatformService } from "@mi-banquito/domain";
import { requirePlatformOperator } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function businessRulesCsv(rows: Array<{
  rule: string;
  currentValue: string;
  priorValue: string;
  newValue: string;
  validFrom: string;
  validTo: string;
  lastChangedAt: string;
  lastChangedBy: string;
  lastChangedByKind: string;
}>) {
  const lines = [
    ["Regla", "Valor actual", "Valor anterior", "Valor nuevo", "Vigente desde", "Vigente hasta", "Último cambio", "Por", "Tipo de actor"],
    ...rows.map((row) => [
      row.rule,
      row.currentValue,
      row.priorValue,
      row.newValue,
      row.validFrom,
      row.validTo,
      row.lastChangedAt,
      row.lastChangedBy,
      row.lastChangedByKind,
    ]),
  ];
  return `${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePlatformOperator();
  const { id } = await params;
  const service = createPlatformService();
  const org = await service.getOrganization(id);

  if (!org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await service.listBusinessRuleRows(org.id);
  const csv = businessRulesCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="business-rules-${org.id}.csv"`,
    },
  });
}
