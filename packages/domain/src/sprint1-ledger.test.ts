import { describe, expect, it } from "vitest";
import {
  availableCapitalAfterBaseFund,
  buildBalanceShareUrl,
  buildMemberCreationLedgerPlan,
  buildMemberStatusTransitionLedgerPlan,
  complianceToneForState,
  contributionSuccessCopy,
  defaultRefundAmount,
  fiscalYearForDate,
  mapComplianceStatusToTone,
  nextWizardStep,
  normalizeWhatsapp,
  quotaDefaultAmount,
  rateConfigChangesOnlyNewLoans,
  reversalSentence,
  shouldCreateRefundExpense,
  summarizeRulesForWizard,
} from "./ledger";

const orgId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-06-29T15:30:00.000Z");

describe("US-026 member creation ledger plan", () => {
  it("prepares the member row, HR-1 version, and audit entry in one org scope", () => {
    const plan = buildMemberCreationLedgerPlan({
      orgId,
      actorId,
      memberId,
      now,
      displayName: "  Ana Mora  ",
      whatsappNumber: "+593987654321",
      joinedOn: "2026-06-29",
      initialSavingsBalance: "15.50",
    });

    expect(plan.member).toMatchObject({
      id: memberId,
      orgId,
      displayName: "Ana Mora",
      whatsappNumber: "+593987654321",
      joinedOn: "2026-06-29",
      role: "aportante",
      status: "activo",
      initialSavingsBalance: "15.50",
      createdAt: now,
      createdBy: actorId,
      createdByKind: "member",
    });
    expect(plan.entityVersion).toMatchObject({
      orgId,
      entityKind: "Member",
      entityId: memberId,
      version: 1,
      validFrom: now,
      changeKind: "create",
      createdBy: actorId,
      createdByKind: "member",
    });
    expect(plan.entityVersion.payloadSnapshot).toEqual(plan.member);
    expect(plan.auditLogEntry).toMatchObject({
      orgId,
      actorKind: "member",
      actorId,
      actionKind: "member.create",
      subjectKind: "Member",
      subjectId: memberId,
      at: now,
      createdAt: now,
    });
    expect(plan.auditLogEntry.payloadSnapshot).toMatchObject({
      displayName: "Ana Mora",
      status: "activo",
      initialSavingsBalance: "15.50",
    });
  });
});

describe("US-027 member status transition ledger plan", () => {
  it("pauses a member without creating a refund expense", () => {
    const plan = buildMemberStatusTransitionLedgerPlan({
      orgId,
      actorId,
      now,
      member: {
        id: memberId,
        orgId,
        displayName: "Ana Mora",
        status: "activo",
        initialSavingsBalance: "42.00",
      },
      previousVersion: 1,
      nextStatus: "en_pausa",
      reason: "Viaje temporal",
    });

    expect(plan.memberUpdate).toEqual({
      status: "en_pausa",
      updatedAt: now,
      updatedBy: actorId,
    });
    expect(plan.entityVersion).toMatchObject({
      orgId,
      entityKind: "Member",
      entityId: memberId,
      version: 2,
      changeKind: "status_transition",
      changeReason: "Viaje temporal",
    });
    expect(plan.refundExpense).toBeUndefined();
    expect(plan.auditLogEntry).toMatchObject({
      actionKind: "member.status_transition",
      reason: "Viaje temporal",
    });
  });

  it("defaults baja refund to accumulated savings and books a member_refund expense", () => {
    const plan = buildMemberStatusTransitionLedgerPlan({
      orgId,
      actorId,
      now,
      member: {
        id: memberId,
        orgId,
        displayName: "Ana Mora",
        status: "activo",
        initialSavingsBalance: "42.00",
      },
      previousVersion: 3,
      nextStatus: "baja",
      reason: "Salida aprobada",
      currencyCode: "USD",
      incurredOn: "2026-06-29",
    });

    expect(plan.memberUpdate.status).toBe("baja");
    expect(plan.entityVersion.version).toBe(4);
    expect(plan.refundExpense).toMatchObject({
      orgId,
      purpose: "member_refund",
      category: "operating",
      amount: "42.00",
      currencyCode: "USD",
      beneficiaryMemberId: memberId,
      incurredOn: "2026-06-29",
      status: "planned",
      createdBy: actorId,
      createdByKind: "member",
    });
  });

  it("requires a reason for every status transition", () => {
    expect(() => buildMemberStatusTransitionLedgerPlan({
      orgId,
      actorId,
      now,
      member: {
        id: memberId,
        orgId,
        displayName: "Ana Mora",
        status: "activo",
        initialSavingsBalance: "42.00",
      },
      previousVersion: 1,
      nextStatus: "baja",
      reason: " ",
    })).toThrow("reason");
  });
});

describe("US-031 compliance state display mapping", () => {
  it.each([
    ["al_dia", "success"],
    ["parcial", "neutral"],
    ["atrasado", "warning"],
    ["en_mora", "danger"],
  ] as const)("maps %s to %s", (state, tone) => {
    expect(complianceToneForState(state)).toBe(tone);
  });
});

describe("US-025 first-run wizard helpers", () => {
  it("resumes at the persisted step", () => {
    expect(nextWizardStep({ firstRunStep: 2, completedAt: null })).toBe(2);
  });

  it("routes completed orgs to normal home", () => {
    expect(nextWizardStep({ firstRunStep: 3, completedAt: new Date("2026-06-29T00:00:00Z") })).toBe("complete");
  });

  it("renders read-only config summary values", () => {
    expect(summarizeRulesForWizard({
      contributionAmount: "20.0000",
      loanRateValue: "4.0000",
      lateThresholdDays: 3,
      moraThresholdDays: 15,
    })).toEqual([
      "Aporte regular: $20.00",
      "Tasa de prestamo: 4.00%",
      "Atraso desde 3 dias; mora desde 15 dias",
    ]);
  });
});

describe("US-026 and US-031 member helpers", () => {
  it("normalizes empty WhatsApp to null", () => {
    expect(normalizeWhatsapp("")).toBeNull();
  });

  it("accepts E.164 WhatsApp numbers", () => {
    expect(normalizeWhatsapp("+593987654321")).toBe("+593987654321");
  });

  it("maps compliance to stable tones", () => {
    expect(mapComplianceStatusToTone("al_dia")).toBe("success");
    expect(mapComplianceStatusToTone("parcial")).toBe("neutral");
    expect(mapComplianceStatusToTone("atrasado")).toBe("warning");
    expect(mapComplianceStatusToTone("en_mora")).toBe("danger");
  });
});

describe("US-027 member status transitions", () => {
  it("defaults refund to accumulated savings", () => {
    expect(defaultRefundAmount("125.5000")).toBe("125.5000");
  });

  it("creates refund expense only for baja", () => {
    expect(shouldCreateRefundExpense("baja")).toBe(true);
    expect(shouldCreateRefundExpense("en_pausa")).toBe(false);
  });
});

describe("US-028 group rules", () => {
  it("does not convert monthly and weekly rates", () => {
    expect(rateConfigChangesOnlyNewLoans({ oldUnit: "monthly", newUnit: "weekly" })).toBe("new_loans_only");
  });

  it("computes fiscal year from configured start", () => {
    expect(fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), { month: 1, day: 1 })).toBe(2026);
    expect(fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), { month: 7, day: 1 })).toBe(2025);
  });
});

describe("US-029 contributions", () => {
  it("builds the success copy", () => {
    expect(contributionSuccessCopy({ memberName: "Ana", amount: "15.0000", datedOn: "2026-06-29" })).toBe(
      "Aporte de Ana registrado - $15.00, 2026-06-29",
    );
  });
});

describe("US-030 contribution reversal", () => {
  it("builds a full Spanish confirmation sentence", () => {
    expect(reversalSentence({ memberName: "Ana", amount: "10.0000", datedOn: "2026-06-29" })).toBe(
      "Vas a reversar el aporte de Ana por $10.00 registrado el 2026-06-29.",
    );
  });
});

describe("US-032 base fund quota", () => {
  it("defaults payment amount from config", () => {
    expect(quotaDefaultAmount("25.0000")).toBe("25.0000");
  });

  it("subtracts base fund from available capital", () => {
    expect(availableCapitalAfterBaseFund({ poolBalance: "1000.0000", baseFundPool: "250.0000" })).toBe("750.0000");
  });
});

describe("US-058 balance sharing", () => {
  it("builds a WhatsApp balance URL with member name and current balance", () => {
    expect(buildBalanceShareUrl({
      whatsappNumber: "+593 99 123 4567",
      memberName: "Ana Mora",
      currentBalance: "120.50",
    })).toBe("https://wa.me/593991234567?text=Hola%20Ana%20Mora%2C%20tu%20saldo%20actual%20en%20Mi%20Banquito%20es%20USD%20120.50.");
  });

  it("returns null when the member has no WhatsApp number", () => {
    expect(buildBalanceShareUrl({
      whatsappNumber: null,
      memberName: "Ana Mora",
      currentBalance: "120.50",
    })).toBeNull();
  });
});
