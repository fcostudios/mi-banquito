import { describe, expect, it } from "vitest";
import {
  buildA4LiquidityLowMarginAlert,
  buildA5ShareOutCommitmentAlert,
  buildA6LoanPastDueAlert,
  buildA9GroupConfigChangedAlert,
  buildA11ContributionMissingPhotoAlert,
  buildA14NegativeMemberBalanceAlert,
} from "./sprint7-alerts";

describe("Sprint 7 alert builders", () => {
  it("builds A4 with month and shortfall", () => {
    const alert = buildA4LiquidityLowMarginAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      month: "2026-09",
      projectedBalance: "75.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.alertKind).toBe("A4");
    expect(alert.severity).toBe("high");
    expect(alert.audience).toBe("treasurer");
    expect(alert.subjectKind).toBe("liquidity_projection");
    expect(alert.subjectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(alert.subjectId).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(alert.payload.copy).toBe("La liquidez proyectada de septiembre 2026 queda $25,00 por debajo del margen de seguridad.");
    expect(alert.payload.month).toBe("2026-09");
    expect(alert.dedupWindowEnd?.toISOString()).toBe("2026-07-13T10:00:00.000Z");
  });

  it("builds A5 with commitment and projected year-end balance", () => {
    const alert = buildA5ShareOutCommitmentAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      year: 2026,
      commitment: "500.0000",
      projectedAvailable: "300.0000",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.alertKind).toBe("A5");
    expect(alert.severity).toBe("high");
    expect(alert.subjectKind).toBe("year_end_share_out");
    expect(alert.subjectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(alert.subjectId).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(alert.payload.title).toBe("Compromiso de reparto excede proyección");
    expect(alert.payload.body).toBe("El compromiso de reparto 2026 es $500,00; la proyección disponible es $300,00; faltan $200,00.");
    expect(alert.payload.copy).toBe("El compromiso de reparto 2026 es $500,00; la proyección disponible es $300,00; faltan $200,00.");
  });

  it("builds stable natural subject IDs for A4 by org and month", () => {
    const base = {
      orgId: "11111111-1111-4111-8111-111111111111",
      projectedBalance: "75.0000",
      safetyMarginAmount: "100.0000",
      now: new Date("2026-07-06T10:00:00.000Z"),
    };
    const september = buildA4LiquidityLowMarginAlert({ ...base, month: "2026-09" });
    const septemberAgain = buildA4LiquidityLowMarginAlert({ ...base, month: "2026-09" });
    const october = buildA4LiquidityLowMarginAlert({ ...base, month: "2026-10" });

    expect(september.subjectId).toBe(septemberAgain.subjectId);
    expect(september.subjectId).not.toBe(october.subjectId);
  });

  it("builds stable natural subject IDs for A5 by org and year", () => {
    const base = {
      orgId: "11111111-1111-4111-8111-111111111111",
      commitment: "500.0000",
      projectedAvailable: "300.0000",
      now: new Date("2026-07-06T10:00:00.000Z"),
    };
    const currentYear = buildA5ShareOutCommitmentAlert({ ...base, year: 2026 });
    const currentYearAgain = buildA5ShareOutCommitmentAlert({ ...base, year: 2026 });
    const nextYear = buildA5ShareOutCommitmentAlert({ ...base, year: 2027 });

    expect(currentYear.subjectId).toBe(currentYearAgain.subjectId);
    expect(currentYear.subjectId).not.toBe(nextYear.subjectId);
  });

  it("formats A5 shortfalls with es-EC thousands separators", () => {
    const alert = buildA5ShareOutCommitmentAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      year: 2026,
      commitment: "1500.0000",
      projectedAvailable: "265.4400",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.payload.copy).toBe("El compromiso de reparto 2026 es $1.500,00; la proyección disponible es $265,44; faltan $1.234,56.");
  });

  it("rounds four-decimal DB money values to cents", () => {
    const alert = buildA5ShareOutCommitmentAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      year: 2026,
      commitment: "1.2399",
      projectedAvailable: "0.0000",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.payload.copy).toBe("El compromiso de reparto 2026 es $1,24; la proyección disponible es $0,00; faltan $1,24.");
  });

  it("builds A6 for member and non-member loans", () => {
    const memberAlert = buildA6LoanPastDueAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      loanId: "22222222-2222-4222-8222-222222222222",
      borrowerName: "Pancho",
      borrowerKind: "member",
      daysLate: 3,
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    const externalAlert = buildA6LoanPastDueAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      loanId: "33333333-3333-4333-8333-333333333333",
      borrowerName: "Ana externa",
      borrowerKind: "non_member",
      guarantorName: "Pancho",
      daysLate: 5,
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(memberAlert.audience).toBe("treasurer");
    expect(memberAlert.dedupWindowEnd?.toISOString()).toBe("2026-07-07T10:00:00.000Z");
    expect(memberAlert.payload.copy).toBe("El préstamo de Pancho está en mora desde hace 3 días.");
    expect(externalAlert.dedupWindowEnd?.toISOString()).toBe("2026-07-07T10:00:00.000Z");
    expect(externalAlert.payload.copy).toBe("El préstamo externo de Ana externa está en mora desde hace 5 días. Garante: Pancho.");
  });

  it("builds A9 with changed keys", () => {
    const alert = buildA9GroupConfigChangedAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      configId: "44444444-4444-4444-8444-444444444444",
      changedKeys: ["base_quota_amount", "interest_rate_pct", "contribution_amount"],
      actorLabel: "Pancho",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.alertKind).toBe("A9");
    expect(alert.severity).toBe("low");
    expect(alert.dedupWindowEnd.toISOString()).toBe("2026-07-06T10:00:00.000Z");
    expect(alert.payload.copy).toBe("Pancho cambió la configuración del grupo: cuota base, tasa de interés, aporte regular.");
  });

  it("builds A11 after N consecutive contributions without photo", () => {
    const alert = buildA11ContributionMissingPhotoAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      memberId: "55555555-5555-4555-8555-555555555555",
      memberName: "Pancho",
      threshold: 3,
      consecutiveCount: 3,
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.alertKind).toBe("A11");
    expect(alert.severity).toBe("low");
    expect(alert.dedupWindowEnd?.toISOString()).toBe("2026-07-13T10:00:00.000Z");
    expect(alert.payload.copy).toBe("Pancho registró 3 aportes consecutivos sin foto de comprobante.");
  });

  it("builds A14 as critical with no dedup suppression", () => {
    const alert = buildA14NegativeMemberBalanceAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      memberId: "55555555-5555-4555-8555-555555555555",
      memberName: "Pancho",
      balance: "-12.5000",
      sourceEventId: "66666666-6666-4666-8666-666666666666",
      now: new Date("2026-07-06T10:00:00.000Z"),
    });

    expect(alert.alertKind).toBe("A14");
    expect(alert.severity).toBe("critical");
    expect(alert.audience).toBe("both");
    expect(alert.subjectKind).toBe("member_negative_balance_event");
    expect(alert.subjectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(alert.dedupWindowEnd.toISOString()).toBe("2026-07-06T10:00:00.000Z");
    expect(alert.payload.copy).toBe("Pancho tiene saldo negativo de -$12,50.");
  });

  it("builds A14 with distinct subjects for distinct source events at the same time", () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const first = buildA14NegativeMemberBalanceAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      memberId: "55555555-5555-4555-8555-555555555555",
      memberName: "Pancho",
      balance: "-12.5000",
      sourceEventId: "66666666-6666-4666-8666-666666666666",
      now,
    });
    const second = buildA14NegativeMemberBalanceAlert({
      orgId: "11111111-1111-4111-8111-111111111111",
      memberId: "55555555-5555-4555-8555-555555555555",
      memberName: "Pancho",
      balance: "-14.5000",
      sourceEventId: "77777777-7777-4777-8777-777777777777",
      now,
    });

    expect(first.dedupWindowEnd.getTime()).toBe(second.dedupWindowEnd.getTime());
    expect(first.subjectKind).toBe(second.subjectKind);
    expect(first.subjectId).not.toBe(second.subjectId);
  });

  it("builds DB/display-compatible alert inserts", () => {
    const now = new Date("2026-07-06T10:00:00.000Z");
    const alerts = [
      buildA4LiquidityLowMarginAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        month: "2026-09",
        projectedBalance: "75.0000",
        safetyMarginAmount: "100.0000",
        now,
      }),
      buildA5ShareOutCommitmentAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        year: 2026,
        commitment: "500.0000",
        projectedAvailable: "300.0000",
        now,
      }),
      buildA6LoanPastDueAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        loanId: "22222222-2222-4222-8222-222222222222",
        borrowerName: "Pancho",
        borrowerKind: "member",
        daysLate: 3,
        now,
      }),
      buildA9GroupConfigChangedAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        configId: "44444444-4444-4444-8444-444444444444",
        changedKeys: ["base_quota_amount"],
        actorLabel: "Pancho",
        now,
      }),
      buildA11ContributionMissingPhotoAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        memberId: "55555555-5555-4555-8555-555555555555",
        memberName: "Pancho",
        threshold: 3,
        consecutiveCount: 3,
        now,
      }),
      buildA14NegativeMemberBalanceAlert({
        orgId: "11111111-1111-4111-8111-111111111111",
        memberId: "55555555-5555-4555-8555-555555555555",
        memberName: "Pancho",
        balance: "-12.5000",
        sourceEventId: "66666666-6666-4666-8666-666666666666",
        now,
      }),
    ];

    expect(alerts.map((alert) => alert.payload.title)).toEqual([
      "Liquidez bajo margen",
      "Compromiso de reparto excede proyección",
      "Préstamo en mora",
      "Cambio de configuración del grupo",
      "Aporte sin foto de comprobante",
      "Saldo de miembro negativo",
    ]);
    for (const alert of alerts) {
      expect(alert.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(alert.dedupWindowEnd).toBeInstanceOf(Date);
      expect(alert.payload.body).toBe(alert.payload.copy);
    }
  });
});
