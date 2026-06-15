import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
});

describe("daily cron route", () => {
  it("rejects requests without CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request("http://localhost/api/cron/daily"));

    expect(response.status).toBe(401);
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("accepts requests with the configured bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/daily", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ran: true });
  });
});
