import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyHypotheticalLoan, createLiquidityService, liquidityNarrative } from "./liquidity";
import { formatMoney4Units, parseMoney4Units } from "./money4";

describe("liquidity projection", () => {
  const series = [
    { monthOn: "2026-07-01", projectedBalance: "300.0000" },
    { monthOn: "2026-08-01", projectedBalance: "260.0000" },
    { monthOn: "2026-09-01", projectedBalance: "420.0000" },
  ];

  it("builds readable narrative for the minimum month and year end", () => {
    expect(liquidityNarrative({ series, commitment: "250.0000" })).toBe(
      "Tu mes mínimo es agosto con $260,00. Llegarás a fin de año con $420,00, lo cual está $170,00 por encima del compromiso.",
    );
  });

  it("applies a hypothetical loan without mutating the original projection", () => {
    const shifted = applyHypotheticalLoan(series, "100.0000");

    expect(shifted.map((row) => row.projectedBalance)).toEqual(["200.0000", "170.0000", "340.0000"]);
    expect(series[0]?.projectedBalance).toBe("300.0000");
  });

  it("models simulated repayments with interest when loan terms are available", () => {
    const shifted = applyHypotheticalLoan(series, "100.0000", {
      rateValue: "5.0000",
      termPeriods: 10,
    });

    expect(shifted.map((row) => row.projectedBalance)).toEqual(["200.0000", "175.0000", "349.5000"]);
  });

  it("subtracts a one-cent sandbox loan from maximum Money4 without precision loss", () => {
    const shifted = applyHypotheticalLoan(
      [{ monthOn: "2026-07-01", projectedBalance: "99999999999999.9999" }],
      "0.0100",
      { rateValue: "5.0000", termPeriods: 10 },
    );

    expect(shifted[0]?.projectedBalance).toBe("99999999999999.9899");
  });

  it("preserves translation invariance for every exact sandbox projection", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 1_000_000_000n }),
      fc.bigInt({ min: 0n, max: 1_000_000_000n }),
      fc.bigInt({ min: 1n, max: 100_000_000n }),
      (balanceUnits, translationUnits, loanUnits) => {
        const base = [{ monthOn: "2026-07-01", projectedBalance: formatMoney4Units(balanceUnits + loanUnits) }];
        const translated = [{
          monthOn: "2026-07-01",
          projectedBalance: formatMoney4Units(balanceUnits + loanUnits + translationUnits),
        }];
        const amount = formatMoney4Units(loanUnits);
        const first = applyHypotheticalLoan(base, amount, { rateValue: "7.1250", termPeriods: 7 });
        const second = applyHypotheticalLoan(translated, amount, { rateValue: "7.1250", termPeriods: 7 });

        expect(
          parseMoney4Units(second[0]?.projectedBalance ?? "0.0000")
          - parseMoney4Units(first[0]?.projectedBalance ?? "0.0000"),
        ).toBe(translationUnits);
      },
    ), { numRuns: 250 });
  });

  it("collects exactly all cent-rounded principal at zero rate by the term boundary", () => {
    fc.assert(fc.property(
      fc.bigInt({ min: 1n, max: 10_000_000n }),
      fc.integer({ min: 1, max: 24 }),
      (principalCents, termPeriods) => {
        const balance = "1000000000.0000";
        const amount = formatMoney4Units(principalCents * BigInt(100));
        const series = Array.from({ length: termPeriods + 1 }, (_, index) => ({
          monthOn: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`,
          projectedBalance: balance,
        }));
        const shifted = applyHypotheticalLoan(series, amount, { rateValue: "0.0000", termPeriods });

        expect(shifted.at(-1)?.projectedBalance).toBe(balance);
      },
    ), { numRuns: 250 });
  });
});

describe("liquidity balance consumers with PostgreSQL", () => {
  const orgId = randomUUID();
  const actorId = randomUUID();
  const memberId = randomUUID();
  const accountId = randomUUID();
  const cycleId = randomUUID();
  const collectionId = randomUUID();
  let db: typeof import("@mi-banquito/db")["db"];

  beforeAll(async () => {
    expect(process.env.DATABASE_URL, "real PostgreSQL is required").toBeTruthy();
    ({ db } = await import("@mi-banquito/db"));
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`
        INSERT INTO organization (id, display_name, country_code, currency_code, timezone, default_language,
          status, created_at, created_by, created_by_kind)
        VALUES (${orgId}, 'Liquidity projection test', 'EC', 'USD', 'America/Guayaquil', 'es-EC',
          'active', now(), ${actorId}, 'system')
      `);
      await tx.execute(sql`
        INSERT INTO member (id, org_id, display_name, joined_on, role, status, initial_savings_balance,
          created_at, created_by, created_by_kind)
        VALUES (${memberId}, ${orgId}, 'Liquidity member', '2026-01-01', 'aportante', 'activo', 0,
          now(), ${actorId}, 'member')
      `);
      await tx.execute(sql`
        INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
        VALUES (${accountId}, ${orgId}, 'Group bank', 'group_bank', true, 'active', now(), ${actorId})
      `);
      await tx.execute(sql`
        INSERT INTO contribution_cycle (id, org_id, cycle_label, kind, opens_on, closes_on,
          expected_amount_per_member, currency_code, status, created_at, created_by, created_by_kind)
        VALUES (${cycleId}, ${orgId}, '2026-07', 'monthly', '2026-07-01', '2026-07-31',
          100, 'USD', 'open', now(), ${actorId}, 'member')
      `);
      await tx.execute(sql`
        INSERT INTO contribution (org_id, cycle_id, member_id, amount, currency_code, dated_on,
          recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind)
        VALUES (${orgId}, ${cycleId}, ${memberId}, 100, 'USD', '2026-07-01', now(), ${accountId},
          'regularized', now(), ${actorId}, 'member')
      `);
      await tx.execute(sql`
        INSERT INTO extraordinary_collection (id, org_id, kind, purpose, beneficiary_member_id, status,
          opened_on, created_at, created_by)
        VALUES (${collectionId}, ${orgId}, 'solidarity', 'Medical support', ${memberId}, 'collecting',
          '2026-07-01', now(), ${actorId})
      `);
      await tx.execute(sql`
        INSERT INTO extraordinary_collection_line (org_id, collection_id, member_id, amount, account_id,
          reconciliation_status, dated_on, created_at, created_by)
        VALUES (${orgId}, ${collectionId}, ${memberId}, 30, ${accountId}, 'regularized', '2026-07-02',
          now(), ${actorId})
      `);
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`DELETE FROM expense WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM extraordinary_collection_line WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM extraordinary_collection WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM contribution WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM contribution_cycle WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM account WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM member WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM organization WHERE id = ${orgId}`);
    });
  });

  it("separates physical, earmarked collection, and spendable balances", async () => {
    const service = createLiquidityService();
    await expect(service.getProjection(orgId)).resolves.toMatchObject({
      physicalCashBalance: "130.0000",
      collectionCashBalance: "30.0000",
      poolBalance: "100.0000",
      regularizedDistributableBalance: "100.0000",
      availableCapital: "100.0000",
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      const payoutId = randomUUID();
      await tx.execute(sql`
        INSERT INTO expense (id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
          status, recorded_at, account_id, category, created_at, created_by, created_by_kind)
        VALUES (${payoutId}, ${orgId}, 'Solidarity payout', 25, 'USD', ${memberId}, '2026-07-03',
          'paid', now(), ${accountId}, 'solidarity_payout', now(), ${actorId}, 'member')
      `);
      await tx.execute(sql`
        UPDATE extraordinary_collection SET paid_out_expense_id = ${payoutId}, surplus_amount = 5,
          disposition = 'retained', disposition_motive = 'Retenido por acta', status = 'closed'
        WHERE id = ${collectionId}
      `);
    });

    await expect(service.getProjection(orgId)).resolves.toMatchObject({
      physicalCashBalance: "105.0000",
      collectionCashBalance: "5.0000",
      regularizedDistributableBalance: "100.0000",
      poolBalance: "100.0000",
    });

    await db.execute(sql`
      INSERT INTO expense (org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
        status, recorded_at, account_id, category, created_at, created_by, created_by_kind)
      VALUES (${orgId}, 'Treasurer compensation', 10, 'USD', ${memberId}, '2026-07-04', 'paid', now(),
        ${accountId}, 'treasurer_comp_payout', now(), ${actorId}, 'member')
    `);

    await expect(service.getProjection(orgId)).resolves.toMatchObject({
      physicalCashBalance: "95.0000",
      collectionCashBalance: "5.0000",
      regularizedDistributableBalance: "90.0000",
      poolBalance: "90.0000",
      availableCapital: "90.0000",
    });
  });

  it("starts every lending projection from the spendable pool, never earmarked cash", async () => {
    const projection = await createLiquidityService().getProjection(orgId);
    expect(projection.series[0]?.projectedBalance).toBe(projection.poolBalance);
    expect(projection.series[0]?.projectedBalance).not.toBe(projection.physicalCashBalance);
  });
});
