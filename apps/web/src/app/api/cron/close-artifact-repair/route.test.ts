import { describe, expect, it, vi } from "vitest";

import { createCloseArtifactRepairHandler } from "./handler";

describe("close artifact repair cron", () => {
  it("fails closed when CRON_SECRET is absent or incorrect", async () => {
    const runRepair = vi.fn();
    const missing = createCloseArtifactRepairHandler({ runRepair, getCronSecret: () => undefined });
    const configured = createCloseArtifactRepairHandler({ runRepair, getCronSecret: () => "correct" });

    expect((await missing(new Request("http://localhost/api/cron/close-artifact-repair"))).status).toBe(401);
    expect((await configured(new Request("http://localhost/api/cron/close-artifact-repair", {
      headers: { authorization: "Bearer wrong" },
    }))).status).toBe(401);
    expect(runRepair).not.toHaveBeenCalled();
  });

  it("runs the injected tenant-safe repair only for the configured bearer secret", async () => {
    const summary = { scannedOrganizations: 2, attempted: 1, ready: 1, failed: 0 };
    const runRepair = vi.fn().mockResolvedValue(summary);
    const handler = createCloseArtifactRepairHandler({ runRepair, getCronSecret: () => "correct" });

    const response = await handler(new Request("http://localhost/api/cron/close-artifact-repair", {
      headers: { authorization: "Bearer correct" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: "close-artifact-repair", ran: true, summary });
    expect(runRepair).toHaveBeenCalledTimes(1);
  });
});
