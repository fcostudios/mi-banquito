import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlobCleanupHandler } from "./handler";

const originalSecret = process.env.CRON_SECRET;
const runCleanup = vi.fn(async () => ({
  orgsScanned: 1,
  scanned: 2,
  deleted: 1,
  preservedReferenced: 1,
  failed: 0,
}));
const GET = createBlobCleanupHandler({ runCleanup });

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  runCleanup.mockClear();
});

describe("blob cleanup cron route", () => {
  it("rejects a missing cron secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request("http://localhost/api/cron/blob-cleanup"))).status).toBe(401);
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("rejects a wrong cron secret", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await GET(new Request("http://localhost/api/cron/blob-cleanup", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it("runs cleanup with the correct cron secret", async () => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await GET(new Request("http://localhost/api/cron/blob-cleanup", {
      headers: { authorization: "Bearer correct-secret" },
    }));
    expect(response.status).toBe(200);
    expect(runCleanup).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(expect.objectContaining({
      job: "blob-cleanup",
      ran: true,
      summary: expect.objectContaining({ scanned: expect.any(Number), failed: expect.any(Number) }),
    }));
  });
});
