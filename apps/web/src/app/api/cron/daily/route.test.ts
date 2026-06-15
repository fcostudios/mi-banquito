import { afterEach, describe, expect, it } from "vitest";
import { GET as accrueInterest } from "../accrue-interest/route";
import { GET as awardTreasurerCompensation } from "../award-treasurer-compensation/route";
import { GET as daily } from "./route";
import { GET as driftCheck } from "../drift-check/route";

const originalSecret = process.env.CRON_SECRET;
const routes = [
  ["/api/cron/accrue-interest", "accrue-interest", accrueInterest],
  ["/api/cron/award-treasurer-compensation", "award-treasurer-compensation", awardTreasurerCompensation],
  ["/api/cron/daily", "daily", daily],
  ["/api/cron/drift-check", "drift-check", driftCheck],
] as const;

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
});

describe("daily cron route", () => {
  it("rejects requests without CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await daily(new Request("http://localhost/api/cron/daily"));

    expect(response.status).toBe(401);
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await daily(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it.each(routes)("accepts authenticated requests for %s", async (path, job, handler) => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await handler(
      new Request(`http://localhost${path}`, {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job, ran: true });
  });
});
