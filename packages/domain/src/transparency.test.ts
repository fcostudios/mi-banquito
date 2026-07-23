import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTransparencyService } from "./transparency";

describe("BR-16 transparency projection with PostgreSQL", () => {
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const actorId = randomUUID();
  const memberId = randomUUID();
  const uninvolvedMemberId = randomUUID();
  const accountId = randomUUID();
  const externalAccountId = randomUUID();
  const otherAccountId = randomUUID();
  const cycleId = randomUUID();
  const loanId = randomUUID();
  const collectionId = randomUUID();
  const ids = {
    contribution: randomUUID(), pendingContribution: randomUUID(), pendingContributionReversal: randomUUID(),
    repayment: randomUUID(), withdrawal: randomUUID(), disbursement: randomUUID(),
    bankFee: randomUUID(), bankFeeReversal: randomUUID(), plannedExpense: randomUUID(), compPayout: randomUUID(), solidarityPayout: randomUUID(),
    transfer: randomUUID(), transferReversal: randomUUID(),
    collectionLine: randomUUID(), collectionLineReversal: randomUUID(), collectionLineLive: randomUUID(),
    otherExpense: randomUUID(),
  };
  let db: typeof import("@mi-banquito/db")["db"];

  beforeAll(async () => {
    expect(process.env.DATABASE_URL, "real PostgreSQL is required").toBeTruthy();
    ({ db } = await import("@mi-banquito/db"));
    await db.execute(sql`
      INSERT INTO organization (id, display_name, country_code, currency_code, timezone, default_language,
        status, created_at, created_by, created_by_kind)
      VALUES (${orgId}, 'Transparency A', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), ${actorId}, 'system'),
        (${otherOrgId}, 'Transparency B', 'EC', 'USD', 'America/Guayaquil', 'es-EC', 'active', now(), ${actorId}, 'system')
    `);
    await db.execute(sql`
      INSERT INTO member (id, org_id, display_name, joined_on, role, status, initial_savings_balance,
        created_at, created_by, created_by_kind)
      VALUES (${memberId}, ${orgId}, 'Member A', '2026-01-01', 'aportante', 'activo', 0, now(), ${actorId}, 'member'),
        (${uninvolvedMemberId}, ${orgId}, 'Member B', '2026-01-01', 'aportante', 'activo', 0, now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO account (id, org_id, name, type, is_group_fund, status, created_at, created_by)
      VALUES (${accountId}, ${orgId}, 'Group', 'group_bank', true, 'active', now(), ${actorId}),
        (${externalAccountId}, ${orgId}, 'External', 'external', false, 'active', now(), ${actorId}),
        (${otherAccountId}, ${otherOrgId}, 'Other group', 'group_bank', true, 'active', now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO contribution_cycle (id, org_id, cycle_label, kind, opens_on, closes_on,
        expected_amount_per_member, currency_code, status, created_at, created_by, created_by_kind)
      VALUES (${cycleId}, ${orgId}, '2026-07', 'monthly', '2026-07-01', '2026-07-31', 100, 'USD', 'open', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO loan (id, org_id, member_id, borrower_kind, borrower_member_id, principal_amount,
        currency_code, rate_value, rate_model, term_periods, grace_periods, originated_on, status,
        created_at, created_by, created_by_kind)
      VALUES (${loanId}, ${orgId}, ${memberId}, 'member', ${memberId}, 30, 'USD', 1, 'declining_balance',
        1, 0, '2026-07-01', 'originated', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO contribution (id, org_id, cycle_id, member_id, amount, currency_code, dated_on,
        recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind)
      VALUES (${ids.contribution}, ${orgId}, ${cycleId}, ${memberId}, 100, 'USD', '2026-07-02',
        now(), ${accountId}, 'regularized', now(), ${actorId}, 'member'),
        (${ids.pendingContribution}, ${orgId}, ${cycleId}, ${memberId}, 15, 'USD', '2026-07-02',
        now(), ${externalAccountId}, 'pending', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO repayment (id, org_id, loan_id, member_id, amount, currency_code, applied_to_principal,
        applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id, reconciliation_status,
        created_at, created_by, created_by_kind)
      VALUES (${ids.repayment}, ${orgId}, ${loanId}, ${memberId}, 20, 'USD', 20, 0, 0, '2026-07-03',
        now(), ${accountId}, 'regularized', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO withdrawal (id, org_id, member_id, amount, currency_code, dated_on, recorded_at,
        kind, created_at, created_by, created_by_kind)
      VALUES (${ids.withdrawal}, ${orgId}, ${memberId}, 10, 'USD', '2026-07-04', now(), 'other', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO loan_disbursement (id, org_id, loan_id, disbursement_source, amount, currency_code,
        disbursed_on, created_at, created_by, created_by_kind)
      VALUES (${ids.disbursement}, ${orgId}, ${loanId}, 'bank_transfer', 30, 'USD', '2026-07-05', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO transfer (id, org_id, from_account_id, to_account_id, amount, currency_code,
        dated_on, purpose, regularizes_kind, regularizes_id, created_at, created_by)
      VALUES (${ids.transfer}, ${orgId}, ${externalAccountId}, ${accountId}, 15, 'USD', '2026-07-06',
        'regularization', 'contribution', ${ids.pendingContribution}, now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO contribution (id, org_id, cycle_id, member_id, amount, currency_code, dated_on,
        recorded_at, account_id, reverses_id, reverse_reason, reconciliation_status, created_at, created_by, created_by_kind)
      VALUES (${ids.pendingContributionReversal}, ${orgId}, ${cycleId}, ${memberId}, -15, 'USD', '2026-07-08',
        now(), ${externalAccountId}, ${ids.pendingContribution}, 'Pending receipt correction', 'pending', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO transfer (id, org_id, from_account_id, to_account_id, amount, currency_code,
        dated_on, purpose, regularizes_kind, regularizes_id, reverses_id, created_at, created_by)
      VALUES (${ids.transferReversal}, ${orgId}, ${accountId}, ${externalAccountId}, 15, 'USD', '2026-07-07',
        'regularization_reversal', 'contribution', ${ids.pendingContribution}, ${ids.transfer}, now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO extraordinary_collection (id, org_id, kind, purpose, beneficiary_member_id, status,
        opened_on, created_at, created_by)
      VALUES (${collectionId}, ${orgId}, 'solidarity', 'Medical help', ${memberId}, 'collecting',
        '2026-07-01', now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO extraordinary_collection_line (id, org_id, collection_id, member_id, amount, account_id,
        reconciliation_status, dated_on, created_at, created_by)
      VALUES (${ids.collectionLine}, ${orgId}, ${collectionId}, ${memberId}, 40, ${accountId}, 'regularized', '2026-07-07', now(), ${actorId}),
        (${ids.collectionLineLive}, ${orgId}, ${collectionId}, ${memberId}, 30, ${accountId}, 'regularized', '2026-07-08', now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO extraordinary_collection_line (id, org_id, collection_id, member_id, amount, account_id,
        reconciliation_status, dated_on, reverses_id, reverse_reason, created_at, created_by)
      VALUES (${ids.collectionLineReversal}, ${orgId}, ${collectionId}, ${memberId}, 40, ${accountId},
        'regularized', '2026-07-09', ${ids.collectionLine}, 'Duplicate line', now(), ${actorId})
    `);
    await db.execute(sql`
      INSERT INTO expense (id, org_id, purpose, amount, currency_code, beneficiary_member_id, incurred_on,
        status, recorded_at, account_id, category, created_at, created_by, created_by_kind)
      VALUES (${ids.bankFee}, ${orgId}, 'Bank fee', 5, 'USD', NULL, '2026-07-10', 'paid', now(), ${accountId}, 'bank_fee', now(), ${actorId}, 'member'),
        (${ids.compPayout}, ${orgId}, 'Treasurer pay', 7, 'USD', ${memberId}, '2026-07-11', 'paid', now(), ${accountId}, 'treasurer_comp_payout', now(), ${actorId}, 'member'),
        (${ids.solidarityPayout}, ${orgId}, 'Solidarity payout', 25, 'USD', ${memberId}, '2026-07-12', 'paid', now(), ${accountId}, 'solidarity_payout', now(), ${actorId}, 'member'),
        (${ids.plannedExpense}, ${orgId}, 'Planned supplies', 123, 'USD', NULL, '2026-07-14', 'planned', now(), ${accountId}, 'supplies', now(), ${actorId}, 'member'),
        (${ids.otherExpense}, ${otherOrgId}, 'Other tenant fee', 999, 'USD', NULL, '2026-07-10', 'paid', now(), ${otherAccountId}, 'bank_fee', now(), ${actorId}, 'member')
    `);
    await db.execute(sql`
      INSERT INTO expense (id, org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
        account_id, category, reverses_id, reverse_reason, created_at, created_by, created_by_kind)
      VALUES (${ids.bankFeeReversal}, ${orgId}, 'reversal: Bank fee', 5, 'USD', '2026-07-13', 'paid', now(),
        ${accountId}, 'bank_fee', ${ids.bankFee}, 'Duplicate bank fee', now(), ${actorId}, 'member')
    `);
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`UPDATE extraordinary_collection SET status = 'closed', paid_out_expense_id = ${ids.solidarityPayout}
        WHERE id = ${collectionId}`);
    });
  });

  afterAll(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`DELETE FROM extraordinary_collection_line WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM extraordinary_collection WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM expense WHERE org_id IN (${orgId}, ${otherOrgId})`);
      await tx.execute(sql`DELETE FROM transfer WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM loan_disbursement WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM repayment WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM withdrawal WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM contribution WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM loan WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM contribution_cycle WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM account WHERE org_id IN (${orgId}, ${otherOrgId})`);
      await tx.execute(sql`DELETE FROM member WHERE org_id = ${orgId}`);
      await tx.execute(sql`DELETE FROM organization WHERE id IN (${orgId}, ${otherOrgId})`);
    });
  });

  it("emits every baseline and Sprint-9 row exactly once, including reversals, without tenant leakage", async () => {
    const result = await createTransparencyService().getPeriod({
      orgId, fromDate: "2026-07-01", throughDate: "2026-07-31",
    });
    const keys = result.rows.map((row) => `${row.sourceKind}:${row.sourceId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining([
      `contribution:${ids.contribution}`, `contribution:${ids.pendingContribution}`,
      `contribution:${ids.pendingContributionReversal}`, `repayment:${ids.repayment}`, `withdrawal:${ids.withdrawal}`,
      `loan_disbursement:${ids.disbursement}`, `expense:${ids.bankFee}`, `expense:${ids.compPayout}`,
      `expense:${ids.bankFeeReversal}`, `expense:${ids.plannedExpense}`, `expense:${ids.solidarityPayout}`, `transfer:${ids.transfer}`,
      `transfer:${ids.transferReversal}`, `collection_line:${ids.collectionLine}`,
      `collection_line:${ids.collectionLineReversal}`, `collection_line:${ids.collectionLineLive}`,
    ]));
    expect(keys).not.toContain(`expense:${ids.otherExpense}`);
    expect(result.rows.find((row) => row.sourceId === ids.collectionLineReversal)?.signedAmount).toBe("-40.0000");
    expect(result.rows.find((row) => row.sourceId === ids.pendingContributionReversal)).toMatchObject({
      signedAmount: "-15.0000", reconciliationStatus: "pending", accountName: "External",
    });
    expect(result.rows.find((row) => row.sourceId === ids.plannedExpense)?.signedAmount).toBe("0.0000");
    expect(result.rows.find((row) => row.sourceId === ids.solidarityPayout)?.collectionId).toBe(collectionId);
    expect(result.rows.map((row) => `${row.datedOn}:${row.sourceKind}:${row.sourceId}`)).toEqual(
      [...result.rows]
        .sort((left, right) => left.datedOn.localeCompare(right.datedOn)
          || left.sourceKind.localeCompare(right.sourceKind)
          || left.sourceId.localeCompare(right.sourceId))
        .map((row) => `${row.datedOn}:${row.sourceKind}:${row.sourceId}`),
    );
    expect(result).toMatchObject({
      netFundBalance: "73.0000",
      regularizedDistributableBalance: "73.0000",
      collectionCashBalance: "5.0000",
      physicalCashBalance: "78.0000",
    });
  });

  it("keeps group reconciliation rows but only member-relevant baseline and collection rows", async () => {
    const result = await createTransparencyService().getPeriod({
      orgId, fromDate: "2026-07-01", throughDate: "2026-07-31", memberId: uninvolvedMemberId,
    });
    expect(result.rows.some((row) => row.sourceKind === "contribution")).toBe(false);
    expect(result.rows.some((row) => row.sourceKind === "collection_line")).toBe(false);
    expect(result.rows.filter((row) => row.sourceKind === "expense")).toHaveLength(5);
    expect(result.rows.filter((row) => row.sourceKind === "transfer")).toHaveLength(2);
  });

  it("moves only the correct balance when collection and compensation payouts occur", async () => {
    const service = createTransparencyService();
    const beforeComp = await service.getPeriod({ orgId, fromDate: "2026-07-01", throughDate: "2026-07-10" });
    const afterComp = await service.getPeriod({ orgId, fromDate: "2026-07-01", throughDate: "2026-07-11" });
    const afterCollectionPayout = await service.getPeriod({ orgId, fromDate: "2026-07-01", throughDate: "2026-07-12" });
    expect([beforeComp.regularizedDistributableBalance, afterComp.regularizedDistributableBalance])
      .toEqual(["75.0000", "68.0000"]);
    expect(afterComp).toMatchObject({ collectionCashBalance: "30.0000", physicalCashBalance: "98.0000" });
    expect(afterCollectionPayout).toMatchObject({
      regularizedDistributableBalance: "68.0000",
      collectionCashBalance: "5.0000",
      physicalCashBalance: "73.0000",
    });
  });

  it("does not let a pending external inflow or its reversed regularization inflate distributable cash", async () => {
    const result = await createTransparencyService().getPeriod({
      orgId, fromDate: "2026-07-01", throughDate: "2026-07-09",
    });
    expect(result.rows.find((row) => row.sourceId === ids.pendingContribution)?.reconciliationStatus).toBe("pending");
    expect(result.rows.find((row) => row.sourceId === ids.transfer)?.signedAmount).toBe("15.0000");
    expect(result.rows.find((row) => row.sourceId === ids.transferReversal)?.signedAmount).toBe("-15.0000");
    expect(result.regularizedDistributableBalance).toBe("80.0000");
  });

  it("nets every source original/reversal pair to zero across all exact Money4 balances", async () => {
    await fc.assert(fc.asyncProperty(
      fc.bigInt({ min: 1n, max: 999_000_000_000_000_000n }),
      async (units) => {
        const amount = `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
        await db.transaction(async (tx) => {
          const snapshot = async () => {
            const result = await tx.execute<{ core: string; physical: string; collection: string }>(sql`
              SELECT fund_pool_balance(${orgId}, '2026-07-31') AS core,
                physical_cash_balance(${orgId}, '2026-07-31') AS physical,
                collection_cash_balance(${orgId}, '2026-07-31') AS collection
            `);
            return (Array.isArray(result) ? result : result.rows ?? [])[0];
          };
          const assertPairNets = async (insertPair: () => Promise<void>) => {
            const before = await snapshot();
            await insertPair();
            expect(await snapshot()).toEqual(before);
          };

          await assertPairNets(async () => {
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO contribution (id, org_id, cycle_id, member_id, amount,
              currency_code, dated_on, recorded_at, account_id, reconciliation_status, created_at, created_by, created_by_kind)
              VALUES (${original}, ${orgId}, ${cycleId}, ${memberId}, ${amount}, 'USD', '2026-07-20', now(),
                ${accountId}, 'regularized', now(), ${actorId}, 'member')`);
            await tx.execute(sql`INSERT INTO contribution (id, org_id, cycle_id, member_id, amount,
              currency_code, dated_on, recorded_at, account_id, reconciliation_status, reverses_id,
              reverse_reason, created_at, created_by, created_by_kind)
              VALUES (${randomUUID()}, ${orgId}, ${cycleId}, ${memberId}, ${`-${amount}`}, 'USD', '2026-07-21', now(),
                ${accountId}, 'regularized', ${original}, 'Property contribution correction', now(), ${actorId}, 'member')`);
          });
          await assertPairNets(async () => {
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO repayment (id, org_id, loan_id, member_id, amount, currency_code,
              applied_to_principal, applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id,
              reconciliation_status, created_at, created_by, created_by_kind)
              VALUES (${original}, ${orgId}, ${loanId}, ${memberId}, ${amount}, 'USD', ${amount}, 0, 0,
                '2026-07-20', now(), ${accountId}, 'regularized', now(), ${actorId}, 'member')`);
            await tx.execute(sql`INSERT INTO repayment (id, org_id, loan_id, member_id, amount, currency_code,
              applied_to_principal, applied_to_interest, applied_to_fee, dated_on, recorded_at, account_id,
              reconciliation_status, reverses_id, reverse_reason, created_at, created_by, created_by_kind)
              VALUES (${randomUUID()}, ${orgId}, ${loanId}, ${memberId}, ${`-${amount}`}, 'USD', ${`-${amount}`}, 0, 0,
                '2026-07-21', now(), ${accountId}, 'regularized', ${original}, 'Property repayment correction',
                now(), ${actorId}, 'member')`);
          });
          await assertPairNets(async () => {
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO withdrawal (id, org_id, member_id, amount, currency_code,
              dated_on, recorded_at, kind, created_at, created_by, created_by_kind)
              VALUES (${original}, ${orgId}, ${memberId}, ${amount}, 'USD', '2026-07-20', now(), 'other', now(), ${actorId}, 'member')`);
            await tx.execute(sql`INSERT INTO withdrawal (id, org_id, member_id, amount, currency_code,
              dated_on, recorded_at, kind, reverses_id, reverse_reason, created_at, created_by, created_by_kind)
              VALUES (${randomUUID()}, ${orgId}, ${memberId}, ${amount}, 'USD', '2026-07-21', now(), 'other',
                ${original}, 'Property withdrawal correction', now(), ${actorId}, 'member')`);
          });
          await assertPairNets(async () => {
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code, incurred_on,
            status, recorded_at, account_id, category, created_at, created_by, created_by_kind)
            VALUES (${original}, ${orgId}, 'Property operating', ${amount}, 'USD', '2026-07-20', 'paid', now(),
              ${accountId}, 'operating', now(), ${actorId}, 'member')`);
            await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code, incurred_on,
            status, recorded_at, account_id, category, reverses_id, reverse_reason, created_at, created_by, created_by_kind)
            VALUES (${randomUUID()}, ${orgId}, 'reversal: Property operating', ${amount}, 'USD', '2026-07-21', 'paid', now(),
              ${accountId}, 'operating', ${original}, 'Property expense correction', now(), ${actorId}, 'member')`);
          });
          await assertPairNets(async () => {
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO transfer (id, org_id, from_account_id, to_account_id, amount,
              currency_code, dated_on, purpose, created_at, created_by)
              VALUES (${original}, ${orgId}, ${externalAccountId}, ${accountId}, ${amount}, 'USD',
                '2026-07-20', 'transfer', now(), ${actorId})`);
            await tx.execute(sql`INSERT INTO transfer (id, org_id, from_account_id, to_account_id, amount,
              currency_code, dated_on, purpose, reverses_id, created_at, created_by)
              VALUES (${randomUUID()}, ${orgId}, ${accountId}, ${externalAccountId}, ${amount}, 'USD',
                '2026-07-21', 'transfer_reversal', ${original}, now(), ${actorId})`);
          });
          await assertPairNets(async () => {
            const header = randomUUID();
            const original = randomUUID();
            await tx.execute(sql`INSERT INTO extraordinary_collection (id, org_id, kind, purpose,
              beneficiary_member_id, status, opened_on, created_at, created_by)
              VALUES (${header}, ${orgId}, 'solidarity', 'Property collection', ${memberId}, 'open',
                '2026-07-20', now(), ${actorId})`);
            await tx.execute(sql`INSERT INTO extraordinary_collection_line (id, org_id, collection_id,
              member_id, amount, account_id, reconciliation_status, dated_on, created_at, created_by)
              VALUES (${original}, ${orgId}, ${header}, ${memberId}, ${amount}, ${accountId}, 'regularized',
                '2026-07-20', now(), ${actorId})`);
            await tx.execute(sql`INSERT INTO extraordinary_collection_line (id, org_id, collection_id,
              member_id, amount, account_id, reconciliation_status, dated_on, reverses_id, reverse_reason,
              created_at, created_by)
              VALUES (${randomUUID()}, ${orgId}, ${header}, ${memberId}, ${amount}, ${accountId}, 'regularized',
                '2026-07-21', ${original}, 'Property collection correction', now(), ${actorId})`);
          });
          await assertPairNets(async () => {
            const payout = randomUUID();
            await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code,
              beneficiary_member_id, incurred_on, status, recorded_at, account_id, category,
              created_at, created_by, created_by_kind)
              VALUES (${payout}, ${orgId}, 'Property solidarity', ${amount}, 'USD', ${memberId},
                '2026-07-20', 'paid', now(), ${accountId}, 'solidarity_payout', now(), ${actorId}, 'member')`);
            await tx.execute(sql`INSERT INTO extraordinary_collection (id, org_id, kind, purpose,
              beneficiary_member_id, status, opened_on, paid_out_expense_id, created_at, created_by)
              VALUES (${randomUUID()}, ${orgId}, 'solidarity', 'Property payout header', ${memberId},
                'closed', '2026-07-20', ${payout}, now(), ${actorId})`);
            await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code,
              beneficiary_member_id, incurred_on, status, recorded_at, account_id, category, reverses_id,
              reverse_reason, client_request_id, created_at, created_by, created_by_kind)
              VALUES (${randomUUID()}, ${orgId}, 'reversal: pago solidario', ${amount}, 'USD', ${memberId},
                '2026-07-21', 'paid', now(), ${accountId}, 'solidarity_payout', ${payout},
                'Property governed payout correction', ${randomUUID()}, now(), ${actorId}, 'member')`);
          });
          throw new Error("property_rollback");
        }).catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== "property_rollback") throw error;
        });
      },
    ), { seed: 99, numRuns: 8 });
  });

  it("lets exactly one concurrent exact reversal win the database uniqueness race", async () => {
    const reversalIds = [randomUUID(), randomUUID()];
    const insertReversal = (id: string) => db.execute(sql`INSERT INTO expense (
      id, org_id, purpose, amount, currency_code, incurred_on, status, recorded_at,
      account_id, category, reverses_id, reverse_reason, created_at, created_by, created_by_kind
    ) VALUES (${id}, ${orgId}, 'reversal: Planned supplies', 123, 'USD', '2026-07-21',
      'planned', now(), ${accountId}, 'supplies', ${ids.plannedExpense}, 'Concurrent correction',
      now(), ${actorId}, 'member')`);
    const outcomes = await Promise.allSettled(reversalIds.map(insertReversal));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "23505" } });
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`DELETE FROM expense WHERE id IN (${reversalIds[0]}, ${reversalIds[1]})`);
    });
  });

  it("fails closed on relevant corruption but ignores future and member-unrelated corruption", async () => {
    const relevantId = randomUUID();
    const futureId = randomUUID();
    const unrelatedId = randomUUID();
    const sameOrgOtherMemberId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code,
        beneficiary_member_id, incurred_on, status, recorded_at, account_id, category,
        reverses_id, reverse_reason, created_at, created_by, created_by_kind)
        VALUES (${relevantId}, ${orgId}, 'Malformed reversal', 6, 'USD', ${memberId},
          '2026-07-20', 'paid', now(), ${accountId}, 'treasurer_comp_payout', ${ids.compPayout},
          'Malformed amount', now(), ${actorId}, 'member')`);
    });
    await expect(createTransparencyService().getPeriod({
      orgId, fromDate: "2026-07-01", throughDate: "2026-07-31",
    })).rejects.toThrow("transparency_reversal_integrity_violation");
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
      await tx.execute(sql`DELETE FROM expense WHERE id = ${relevantId}`);
      await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code,
        beneficiary_member_id, incurred_on, status, recorded_at, account_id, category,
        reverses_id, reverse_reason, created_at, created_by, created_by_kind)
        VALUES (${futureId}, ${orgId}, 'Malformed future reversal', 6, 'USD', ${memberId},
          '2026-08-01', 'paid', now(), ${accountId}, 'treasurer_comp_payout', ${ids.compPayout},
          'Future malformed amount', now(), ${actorId}, 'member')`);
      await tx.execute(sql`INSERT INTO expense (id, org_id, purpose, amount, currency_code,
        incurred_on, status, recorded_at, account_id, category, reverses_id, reverse_reason,
        created_at, created_by, created_by_kind)
        VALUES (${unrelatedId}, ${otherOrgId}, 'Malformed unrelated reversal', 998, 'USD',
          '2026-07-20', 'paid', now(), ${otherAccountId}, 'bank_fee', ${ids.otherExpense},
          'Other tenant malformed amount', now(), ${actorId}, 'member')`);
      await tx.execute(sql`INSERT INTO contribution (id, org_id, cycle_id, member_id, amount,
        currency_code, dated_on, recorded_at, account_id, reconciliation_status, reverses_id,
        reverse_reason, created_at, created_by, created_by_kind)
        VALUES (${sameOrgOtherMemberId}, ${orgId}, ${cycleId}, ${memberId}, 99, 'USD', '2026-07-20', now(),
          ${accountId}, 'regularized', ${ids.contribution}, 'Same org malformed amount', now(), ${actorId}, 'member')`);
    });
    try {
      await expect(createTransparencyService().getPeriod({
        orgId, fromDate: "2026-07-01", throughDate: "2026-07-31", memberId: uninvolvedMemberId,
      })).rejects.toThrow("transparency_reversal_integrity_violation");
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.execute(sql`DELETE FROM contribution WHERE id = ${sameOrgOtherMemberId}`);
      });
      await expect(createTransparencyService().getPeriod({
        orgId, fromDate: "2026-07-01", throughDate: "2026-07-31", memberId: uninvolvedMemberId,
      })).resolves.toMatchObject({ regularizedDistributableBalance: "73.0000" });
    } finally {
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET LOCAL session_replication_role = replica"));
        await tx.execute(sql`DELETE FROM expense WHERE id = ${futureId}`);
        await tx.execute(sql`DELETE FROM expense WHERE id = ${unrelatedId}`);
        await tx.execute(sql`DELETE FROM contribution WHERE id = ${sameOrgOtherMemberId}`);
      });
    }
  });
});
