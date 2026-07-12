import { NextResponse } from "next/server";

import type { CloseArtifactRepairSummary } from "@mi-banquito/domain";

export function createCloseArtifactRepairHandler(input: {
  runRepair: () => Promise<CloseArtifactRepairSummary>;
  getCronSecret?: () => string | undefined;
}) {
  return async function closeArtifactRepairHandler(request: Request) {
    const expected = (input.getCronSecret ?? (() => process.env.CRON_SECRET))();
    if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await input.runRepair();
    return NextResponse.json({ job: "close-artifact-repair", ran: summary.failed === 0, summary }, {
      status: summary.failed === 0 ? 200 : 500,
    });
  };
}
