import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  createCompensationService: vi.fn(),
  awardDueTreasurerCompensation: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@mi-banquito/domain", () => ({
  createCollectionsService: vi.fn(),
  createCompensationService: mocks.createCompensationService,
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
  mocks.awardDueTreasurerCompensation.mockResolvedValue({
    orgsProcessed: 3,
    configsScanned: 4,
    dueConfigs: 2,
    disbursementsAwarded: 1,
    skippedExistingDisbursements: 1,
    configsAdvanced: 1,
    failures: [],
  });
  mocks.createCompensationService.mockReturnValue({
    awardDueTreasurerCompensation: mocks.awardDueTreasurerCompensation,
  });
});

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
  vi.clearAllMocks();
});

describe("award treasurer compensation cron route", () => {
  it("rejects requests without CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new Request("http://localhost/api/cron/award-treasurer-compensation"));

    expect(response.status).toBe(401);
    expect(mocks.createCompensationService).not.toHaveBeenCalled();
    expect(mocks.awardDueTreasurerCompensation).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong bearer token", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/award-treasurer-compensation", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createCompensationService).not.toHaveBeenCalled();
    expect(mocks.awardDueTreasurerCompensation).not.toHaveBeenCalled();
  });

  it("awards due treasurer compensation for the requested date", async () => {
    process.env.CRON_SECRET = "correct-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/award-treasurer-compensation?date=2026-07-04", {
        headers: { authorization: "Bearer correct-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job: "award-treasurer-compensation",
      ran: true,
      summary: {
        job: "award-treasurer-compensation",
        endpoint: "/api/cron/award-treasurer-compensation",
        fromDate: "2026-07-04",
        toDate: "2026-07-04",
        compensationConfigsScanned: 4,
        compensationDueConfigs: 2,
        compensationDisbursementsAwarded: 1,
        compensationSkippedExistingDisbursements: 1,
        compensationConfigsAdvanced: 1,
        failures: [],
      },
    });
    expect(mocks.createCompensationService).toHaveBeenCalledOnce();
    expect(mocks.awardDueTreasurerCompensation).toHaveBeenCalledWith("2026-07-04");
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "/api/cron/award-treasurer-compensation",
      orgsProcessed: 3,
      failureCount: 0,
      replayFrom: "2026-07-04",
      replayTo: "2026-07-04",
      summary: expect.objectContaining({
        job: "award-treasurer-compensation",
        compensationDisbursementsAwarded: 1,
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
        new Request("http://localhost/api/cron/award-treasurer-compensation", {
          headers: { authorization: "Bearer correct-secret" },
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.awardDueTreasurerCompensation).toHaveBeenCalledWith("2026-07-05");
    } finally {
      vi.useRealTimers();
    }
  });
});
