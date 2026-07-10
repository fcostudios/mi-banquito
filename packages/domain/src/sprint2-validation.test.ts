import { describe, expect, it } from "vitest";
import {
  contributionFormSchema,
  cronReplayFormSchema,
  loanOriginationFormSchema,
  loanRepaymentFormSchema,
  memberPaymentFormSchema,
} from "@mi-banquito/contracts";

describe("Sprint 2 form validation", () => {
  it("allows cash contribution without a slip photo", () => {
    const parsed = contributionFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "cash_in_meeting",
      kind: "partial",
      slipPhotoId: "",
    });

    expect(parsed.paymentSource).toBe("cash_in_meeting");
    expect(parsed.kind).toBe("partial");
    expect(parsed.slipPhotoId).toBe("");
  });

  it("rejects bank contribution without a slip photo", () => {
    expect(() => contributionFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      paymentSource: "bank_transfer",
      kind: "regular",
      slipPhotoId: "",
    })).toThrow();
  });

  it("defaults contribution source to cash so a receipt is not required before uploads exist", () => {
    const parsed = contributionFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "10.0000",
      datedOn: "2026-06-30",
      slipPhotoId: "",
    });

    expect(parsed.paymentSource).toBe("cash_in_meeting");
    expect(parsed.kind).toBe("regular");
  });

  it("validates member loan origination and coerces term periods", () => {
    const parsed = loanOriginationFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      borrowerKind: "member",
      borrowerMemberId: "22222222-2222-4222-8222-222222222222",
      principalAmount: "1000.0000",
      termPeriods: "10",
      originatedOn: "2026-06-30",
      purpose: "Capital de trabajo",
    });

    expect(parsed.borrowerKind).toBe("member");
    expect(parsed.termPeriods).toBe(10);
    expect(parsed.disbursementSource).toBe("bank_transfer");
  });

  it("accepts petty cash as a loan disbursement source", () => {
    const parsed = loanOriginationFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      borrowerKind: "member",
      borrowerMemberId: "22222222-2222-4222-8222-222222222222",
      principalAmount: "1000.0000",
      termPeriods: "10",
      originatedOn: "2026-06-30",
      disbursementSource: "petty_cash",
    });

    expect(parsed.disbursementSource).toBe("petty_cash");
  });

  it("rejects non-member loan origination without a guarantor", () => {
    expect(() => loanOriginationFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      borrowerKind: "non_member",
      nonMemberDisplayName: "Cliente externo",
      nonMemberWhatsappNumber: "+593987654321",
      principalAmount: "500.0000",
      termPeriods: "5",
      originatedOn: "2026-06-30",
    })).toThrow();
  });

  it("validates loan repayment", () => {
    const parsed = loanRepaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      loanId: "22222222-2222-4222-8222-222222222222",
      amount: "125.0000",
      datedOn: "2026-06-30",
      slipPhotoId: "",
    });

    expect(parsed.amount).toBe("125.0000");
    expect(parsed.paymentMode).toBe("next_installment");
  });

  it("validates cron replay endpoint and date range", () => {
    const parsed = cronReplayFormSchema.parse({
      endpoint: "accrue-interest",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
    });

    expect(parsed.endpoint).toBe("accrue-interest");
  });
});

describe("memberPaymentFormSchema", () => {
  it("accepts an untargeted member payment with no extra decision", () => {
    expect(memberPaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "80.00",
      datedOn: "2026-07-09",
      paymentSource: "cash_in_meeting",
    })).toMatchObject({
      amount: "80.00",
      paymentSource: "cash_in_meeting",
    });
  });

  it("rejects loan-principal extra decision without an explicit open loan target", () => {
    expect(() => memberPaymentFormSchema.parse({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      amount: "80.00",
      datedOn: "2026-07-09",
      paymentSource: "cash_in_meeting",
      extraDecision: "loan_principal",
    })).toThrow();
  });
});
