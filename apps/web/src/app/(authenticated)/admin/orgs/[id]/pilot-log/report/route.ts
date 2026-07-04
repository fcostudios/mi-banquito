import { NextResponse } from "next/server";
import { createPilotService, evaluatePilotExitChecklist } from "@mi-banquito/domain";

import { requirePlatformOperator } from "@/lib/auth/require-session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOperator();
  const { id } = await params;
  const entries = await createPilotService().listEntries(id);
  const checklist = evaluatePilotExitChecklist(entries.map((row) => ({
    observedOn: row.observedOn,
    cleanMonth: row.cleanMonth,
    wouldNotReturnToPaper: row.wouldNotReturnToPaper,
  })));
  const body = [
    "Reporte de salida del piloto",
    `Org: ${id}`,
    `Listo para salida: ${checklist.readyToExit ? "si" : "no"}`,
    ...entries.map((row) => `${row.observedOn}: cuaderno=${row.paperValue}; sistema=${row.systemValue}; diferencia=${row.discrepancy}`),
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "application/pdf; charset=utf-8",
      "content-disposition": `attachment; filename="pilot-${id}.pdf"`,
    },
  });
}
