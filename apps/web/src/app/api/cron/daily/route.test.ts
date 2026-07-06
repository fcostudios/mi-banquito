import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAlertsService: vi.fn(),
  emitCloseOverdueAlerts: vi.fn(),
  emitSprint6DailyAlerts: vi.fn(),
  createCompensationService: vi.fn(),
  awardDueTreasurerCompensation: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@mi-banquito/domain", () => ({
  createCollectionsService: vi.fn(),
  createAlertsService: mocks.createAlertsService,
  createCompensationService: mocks.createCompensationService,
}));

vi.mock("@mi-banquito/db", () => ({
  db: {
    insert: mocks.insert,
  },
}));

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

beforeEach(() => {
  mocks.values.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({
    values: mocks.values,
  });
  mocks.awardDueTreasurerCompensation.mockResolvedValue({
    orgsProcessed: 1,
    configsScanned: 0,
    dueConfigs: 0,
    disbursementsAwarded: 0,
    skippedExistingDisbursements: 0,
    configsAdvanced: 0,
    failures: [],
  });
  mocks.emitCloseOverdueAlerts.mockResolvedValue({
    orgsScanned: 1,
    alertsEmitted: 1,
    alertsSkippedExisting: 0,
    alertsCleared: 0,
    failures: [],
  });
  mocks.emitSprint6DailyAlerts.mockResolvedValue({
    pendingReconciliationAlertsEmitted: 1,
    loanDueSoonAlertsEmitted: 2,
    contributionLateAlertsEmitted: 3,
    skippedExisting: 0,
    failures: [],
  });
  mocks.createAlertsService.mockReturnValue({
    emitCloseOverdueAlerts: mocks.emitCloseOverdueAlerts,
    emitSprint6DailyAlerts: mocks.emitSprint6DailyAlerts,
  });
  mocks.createCompensationService.mockReturnValue({
    awardDueTreasurerCompensation: mocks.awardDueTreasurerCompensation,
  });
});

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
  vi.clearAllMocks();
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
    if (job === "award-treasurer-compensation") {
      expect(await response.json()).toMatchObject({ job, ran: true });
    } else if (job === "daily") {
      expect(await response.json()).toMatchObject({
        job,
        ran: true,
        summary: {
          job: "daily",
          endpoint: "/api/cron/daily",
          orgsProcessed: 1,
          compensationConfigsScanned: 0,
          compensationDueConfigs: 0,
          compensationDisbursementsAwarded: 0,
          compensationSkippedExistingDisbursements: 0,
          compensationConfigsAdvanced: 0,
          closeOverdueOrgsScanned: 1,
          closeOverdueAlertsEmitted: 1,
          closeOverdueAlertsSkippedExisting: 0,
          closeOverdueAlertsCleared: 0,
          sprint6PendingReconciliationAlertsEmitted: 1,
          sprint6LoanDueSoonAlertsEmitted: 2,
          sprint6ContributionLateAlertsEmitted: 3,
          failures: [],
        },
      });
      expect(mocks.emitCloseOverdueAlerts).toHaveBeenCalledWith({
        today: expect.any(Date),
      });
      expect(mocks.emitSprint6DailyAlerts).toHaveBeenCalledWith({
        today: expect.any(Date),
      });
    } else {
      expect(await response.json()).toEqual({ job, ran: true });
    }
  });
});
