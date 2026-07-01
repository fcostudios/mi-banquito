import { describe, expect, it } from "vitest";
import {
  contribution,
  cronRun,
  loan,
  loanGuarantor,
  loanReferral,
  nonMemberBorrower,
} from "@mi-banquito/db/schema";

describe("Sprint 2 schema exports", () => {
  it("exposes contribution source, borrower, guarantor, referral, and cron columns", () => {
    expect(contribution.paymentSource.name).toBe("payment_source");
    expect(contribution.kind.name).toBe("kind");
    expect(loan.borrowerKind.name).toBe("borrower_kind");
    expect(loan.borrowerMemberId.name).toBe("borrower_member_id");
    expect(loan.borrowerNonMemberId.name).toBe("borrower_non_member_id");
    expect(loan.groupConfigVersionAtOrigination.name).toBe("group_config_version_at_origination");
    expect(loan.referrerMemberId.name).toBe("referrer_member_id");
    expect(nonMemberBorrower.displayName.name).toBe("display_name");
    expect(loanGuarantor.guarantorMemberId.name).toBe("guarantor_member_id");
    expect(loanReferral.commissionAmount.name).toBe("commission_amount");
    expect(cronRun.endpoint.name).toBe("endpoint");
    expect(cronRun.finishedAt.name).toBe("finished_at");
    expect(cronRun.failureCount.name).toBe("failure_count");
    expect(cronRun.triggeredByKind.name).toBe("triggered_by_kind");
  });
});
