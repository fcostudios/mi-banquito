import { NextResponse } from "next/server";

import {
  createAdminDriftService,
  createPostgresAdminDriftRepository,
  type AdminDriftRepository,
  type DriftRunner,
} from "@mi-banquito/domain";

import { createConfiguredDriftRunner } from "@/lib/drift/runner";

export function createDriftCheckHandler(options: {
  repository?: AdminDriftRepository;
  runner?: DriftRunner;
  getCronSecret?: () => string | undefined;
} = {}) {
  return async function driftCheckHandler(request: Request) {
    const expected = (options.getCronSecret ?? (() => process.env.CRON_SECRET))();
    if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repository = options.repository ?? createPostgresAdminDriftRepository();
    const runner = options.runner ?? createConfiguredDriftRunner();
    const result = await createAdminDriftService({ repository, runner }).run();
    if (result.overlap) {
      return NextResponse.json({ job: "drift-check", ran: false, overlap: true }, { status: 409 });
    }
    return NextResponse.json({
      job: "drift-check",
      ran: result.exitCode === 0,
      exitCode: result.exitCode,
      checkedAt: result.checkedAt.toISOString(),
    }, { status: result.exitCode === 0 ? 200 : 500 });
  };
}
