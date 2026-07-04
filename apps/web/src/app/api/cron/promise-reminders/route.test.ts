import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  createCollectionsService: vi.fn(),
  emitPromiseReminders: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@mi-banquito/domain", () => ({
  createCollectionsService: mocks.createCollectionsService,
}));

vi.mock("@mi-banquito/db", () => ({
  db: {
    insert: mocks.insert,
  },
}));

const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  mocks.values.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({
    values: mocks.values,
  });
  mocks.emitPromiseReminders.mockResolvedValue({
    promisesScanned: 3,
    remindersEmitted: 2,
  });
  mocks.createCollectionsService.mockReturnValue({
    emitPromiseReminders: mocks.emitPromiseReminders,
  });
});

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
  vi.clearAllMocks();
});

describe("promise reminders cron route", () => {
  it("rejects requests without CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request("http://localhost/api/cron/promise-reminders"));

    expect(response.status).toBe(401);
    expect(mocks.createCollectionsService).not.toHaveBeenCalled();
    expect(mocks.emitPromiseReminders).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/promise-reminders", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createCollectionsService).not.toHaveBeenCalled();
    expect(mocks.emitPromiseReminders).not.toHaveBeenCalled();
  });

  it("emits promise reminders for the requested date", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/promise-reminders?date=2026-07-04", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job: "promise-reminders",
      ran: true,
      summary: {
        job: "promise-reminders",
        endpoint: "/api/cron/promise-reminders",
        fromDate: "2026-07-04",
        toDate: "2026-07-04",
        promisesScanned: 3,
        remindersEmitted: 2,
        failures: [],
      },
    });
    expect(mocks.createCollectionsService).toHaveBeenCalledOnce();
    expect(mocks.emitPromiseReminders).toHaveBeenCalledWith("2026-07-04");
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "/api/cron/promise-reminders",
      orgsProcessed: 0,
      failureCount: 0,
      replayFrom: "2026-07-04",
      replayTo: "2026-07-04",
      summary: expect.objectContaining({
        job: "promise-reminders",
        promisesScanned: 3,
        remindersEmitted: 2,
        failures: [],
      }),
    }));
  });

  it("uses today's date when no date override is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T04:00:00.000Z"));
    process.env.CRON_SECRET = "correct-secret";

    try {
      const response = await GET(
        new Request("http://localhost/api/cron/promise-reminders", {
          headers: { authorization: "Bearer correct-secret" },
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.emitPromiseReminders).toHaveBeenCalledWith("2026-07-05");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records a failed cron run for invalid date overrides", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/promise-reminders?date=07-04-2026", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      job: "promise-reminders",
      ran: false,
      summary: expect.objectContaining({
        failures: [
          {
            orgId: "system",
            message: "date must be YYYY-MM-DD",
          },
        ],
      }),
    });
    expect(mocks.emitPromiseReminders).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "/api/cron/promise-reminders",
      failureCount: 1,
      summary: expect.objectContaining({
        failures: [
          {
            orgId: "system",
            message: "date must be YYYY-MM-DD",
          },
        ],
      }),
    }));
  });

  it("records a failed cron run for impossible calendar dates without persisting them as replay dates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T04:00:00.000Z"));
    process.env.CRON_SECRET = "correct-secret";

    try {
      const response = await GET(
        new Request("http://localhost/api/cron/promise-reminders?date=2026-02-31", {
          headers: { authorization: "Bearer correct-secret" },
        }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        job: "promise-reminders",
        ran: false,
        summary: expect.objectContaining({
          fromDate: "2026-07-05",
          toDate: "2026-07-05",
          failures: [
            {
              orgId: "system",
              message: "date must be a valid calendar date",
            },
          ],
        }),
      });
      expect(mocks.emitPromiseReminders).not.toHaveBeenCalled();
      expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
        replayFrom: "2026-07-05",
        replayTo: "2026-07-05",
        failureCount: 1,
        summary: expect.objectContaining({
          failures: [
            {
              orgId: "system",
              message: "date must be a valid calendar date",
            },
          ],
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});
