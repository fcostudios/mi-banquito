import { NextResponse } from "next/server";

import type { BlobCleanupSummary } from "@mi-banquito/domain";

export function createBlobCleanupHandler(input: {
  runCleanup: () => Promise<BlobCleanupSummary>;
  getCronSecret?: () => string | undefined;
}) {
  return async function blobCleanupHandler(request: Request) {
    const expected = (input.getCronSecret ?? (() => process.env.CRON_SECRET))();
    if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await input.runCleanup();
    return NextResponse.json({ job: "blob-cleanup", ran: summary.failed === 0, summary }, {
      status: summary.failed === 0 ? 200 : 500,
    });
  };
}
