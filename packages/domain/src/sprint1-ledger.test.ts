import { describe, expect, it } from "vitest";
import {
  buildMemberCreationLedgerPlan,
  buildMemberStatusTransitionLedgerPlan,
  complianceToneForState,
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
    ["al_dia", "green"],
    ["atrasado", "amber"],
    ["en_mora", "red"],
  ] as const)("maps %s to %s", (state, tone) => {
    expect(complianceToneForState(state)).toBe(tone);
  });
});
