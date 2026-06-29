import { describe, expect, it } from "vitest";
import {
  auditLogEntry,
  baseFundQuotaConfig,
  baseFundQuotaPayment,
  contribution,
  entityVersion,
  groupConfig,
  member,
  organization,
} from "./schema";

describe("Sprint 1 schema exports", () => {
  it("exposes required Sprint 1 base entities", () => {
    expect(organization.id.name).toBe("id");
    expect(organization.firstRunStep.name).toBe("first_run_step");
    expect(organization.firstRunCompletedAt.name).toBe("first_run_completed_at");
    expect(groupConfig.validTo.name).toBe("valid_to");
    expect(groupConfig.loanRatePeriodUnit.name).toBe("loan_rate_period_unit");
    expect(groupConfig.fiscalYearStartMonth.name).toBe("fiscal_year_start_month");
    expect(groupConfig.fiscalYearStartDay.name).toBe("fiscal_year_start_day");
    expect(member.status.name).toBe("status");
    expect(contribution.clientRequestId.name).toBe("client_request_id");
    expect(entityVersion.entityKind.name).toBe("entity_kind");
    expect(auditLogEntry.actionKind.name).toBe("action_kind");
    expect(baseFundQuotaConfig.perMemberAmount.name).toBe("per_member_amount");
    expect(baseFundQuotaPayment.paidViaContributionId.name).toBe("paid_via_contribution_id");
  });
});
