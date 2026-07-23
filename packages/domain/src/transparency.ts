import { sql } from "drizzle-orm";

import { withTenantTransaction } from "@mi-banquito/db/tenant";

export type TransparencySourceKind =
  | "contribution"
  | "repayment"
  | "withdrawal"
  | "loan_disbursement"
  | "expense"
  | "transfer"
  | "collection_line";

export type TransparencyMovement = {
  sourceKind: TransparencySourceKind;
  sourceId: string;
  datedOn: string;
  memberId: string | null;
  collectionId: string | null;
  category: string;
  label: string;
  signedAmount: string;
  reconciliationStatus: "pending" | "regularized" | null;
  reversesId: string | null;
  accountName: string | null;
};

export type PeriodTransparency = {
  rows: TransparencyMovement[];
  netFundBalance: string;
  physicalCashBalance: string;
  collectionCashBalance: string;
  regularizedDistributableBalance: string;
};

export type PeriodTransparencyInput = {
  orgId: string;
  fromDate: string;
  throughDate: string;
  memberId?: string | null;
};

export interface TransparencyService {
  readonly context: "transparency";
  getPeriod(input: PeriodTransparencyInput): Promise<PeriodTransparency>;
}

type MovementRow = Omit<TransparencyMovement, "datedOn" | "signedAmount"> & {
  datedOn: string | Date;
  signedAmount: string | number;
};

type BalanceRow = {
  netFundBalance: string;
  physicalCashBalance: string;
  collectionCashBalance: string;
  regularizedDistributableBalance: string;
};

type IntegrityRow = { invalid: boolean };
type Transaction = Parameters<Parameters<typeof withTenantTransaction>[1]>[0];

function rowsOf<T>(result: T[] | { rows?: T[] }): T[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function dateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function getPeriodTransparency(
  tx: Transaction,
  input: PeriodTransparencyInput,
): Promise<PeriodTransparency> {
  if (input.fromDate > input.throughDate) throw new Error("transparency_period_invalid");
  const memberId = input.memberId ?? null;
  const integrityResult = await tx.execute<IntegrityRow>(sql`
    WITH core_reversals AS (
      SELECT 'contribution'::text AS kind, reversal.reverses_id, reversal.id,
        original.id AS original_id, original.reverses_id AS original_reverses_id,
        ABS(reversal.amount) = ABS(original.amount) AND reversal.currency_code = original.currency_code
          AND reversal.cycle_id = original.cycle_id AND reversal.member_id = original.member_id
          AND reversal.kind = original.kind AND reversal.payment_source = original.payment_source
          AND reversal.account_id IS NOT DISTINCT FROM original.account_id
          AND reversal.reconciliation_status = original.reconciliation_status
          AND reversal.payment_receipt_id IS NOT DISTINCT FROM original.payment_receipt_id
          AND reversal.dated_on >= original.dated_on AND length(btrim(reversal.reverse_reason)) >= 3 AS exact
      FROM contribution reversal
      LEFT JOIN contribution original
        ON original.org_id = reversal.org_id AND original.id = reversal.reverses_id
      WHERE reversal.org_id = ${input.orgId} AND reversal.reverses_id IS NOT NULL
        AND reversal.dated_on <= ${input.throughDate}::date
      UNION ALL
      SELECT 'repayment', reversal.reverses_id, reversal.id, original.id, original.reverses_id,
        ABS(reversal.amount) = ABS(original.amount) AND reversal.currency_code = original.currency_code
          AND reversal.loan_id = original.loan_id AND reversal.member_id = original.member_id
          AND ABS(reversal.applied_to_principal) = ABS(original.applied_to_principal)
          AND ABS(reversal.applied_to_interest) = ABS(original.applied_to_interest)
          AND ABS(reversal.applied_to_fee) = ABS(original.applied_to_fee)
          AND reversal.account_id IS NOT DISTINCT FROM original.account_id
          AND reversal.reconciliation_status = original.reconciliation_status
          AND reversal.payment_receipt_id IS NOT DISTINCT FROM original.payment_receipt_id
          AND reversal.dated_on >= original.dated_on AND length(btrim(reversal.reverse_reason)) >= 3
      FROM repayment reversal
      LEFT JOIN repayment original
        ON original.org_id = reversal.org_id AND original.id = reversal.reverses_id
      WHERE reversal.org_id = ${input.orgId} AND reversal.reverses_id IS NOT NULL
        AND reversal.dated_on <= ${input.throughDate}::date
      UNION ALL
      SELECT 'withdrawal', reversal.reverses_id, reversal.id, original.id, original.reverses_id,
        ABS(reversal.amount) = ABS(original.amount) AND reversal.currency_code = original.currency_code
          AND reversal.member_id = original.member_id
          AND (reversal.kind = original.kind
            OR (original.kind = 'year_end_share_out' AND reversal.kind = 'year_end_reversal'))
          AND reversal.share_out_id IS NOT DISTINCT FROM original.share_out_id
          AND reversal.year_end_share_out_line_id IS NOT DISTINCT FROM original.year_end_share_out_line_id
          AND reversal.dated_on >= original.dated_on AND length(btrim(reversal.reverse_reason)) >= 3
      FROM withdrawal reversal
      LEFT JOIN withdrawal original
        ON original.org_id = reversal.org_id AND original.id = reversal.reverses_id
      WHERE reversal.org_id = ${input.orgId} AND reversal.reverses_id IS NOT NULL
        AND reversal.dated_on <= ${input.throughDate}::date
      UNION ALL
      SELECT 'expense', reversal.reverses_id, reversal.id, original.id, original.reverses_id,
        ABS(reversal.amount) = ABS(original.amount) AND reversal.currency_code = original.currency_code
          AND reversal.account_id IS NOT DISTINCT FROM original.account_id
          AND reversal.category = original.category AND reversal.status = original.status
          AND reversal.beneficiary_member_id IS NOT DISTINCT FROM original.beneficiary_member_id
          AND reversal.beneficiary_text IS NOT DISTINCT FROM original.beneficiary_text
          AND (CASE WHEN original.category = 'solidarity_payout'
            THEN reversal.purpose = 'reversal: pago solidario'
            ELSE reversal.purpose IN (original.purpose, 'reversal: ' || original.purpose) END)
          AND reversal.incurred_on >= original.incurred_on
          AND length(btrim(reversal.reverse_reason)) >= 3
      FROM expense reversal
      LEFT JOIN expense original
        ON original.org_id = reversal.org_id AND original.id = reversal.reverses_id
      WHERE reversal.org_id = ${input.orgId} AND reversal.reverses_id IS NOT NULL
        AND reversal.incurred_on <= ${input.throughDate}::date
    ), transfer_reversals AS (
      SELECT reversal.reverses_id, reversal.id, original.id AS original_id,
        original.reverses_id AS original_reverses_id,
        reversal.from_account_id = original.to_account_id
          AND reversal.to_account_id = original.from_account_id
          AND reversal.amount = original.amount
          AND reversal.currency_code = original.currency_code
          AND reversal.purpose = CASE
            WHEN original.purpose = 'regularization' THEN 'regularization_reversal'
            WHEN original.purpose = 'collection_surplus_return' THEN 'collection_surplus_return_reversal'
            ELSE 'transfer_reversal' END
          AND reversal.regularizes_kind IS NOT DISTINCT FROM original.regularizes_kind
          AND reversal.regularizes_id IS NOT DISTINCT FROM original.regularizes_id
          AND reversal.dated_on >= original.dated_on AS exact
      FROM transfer reversal
      LEFT JOIN transfer original
        ON original.org_id = reversal.org_id AND original.id = reversal.reverses_id
      WHERE reversal.org_id = ${input.orgId} AND reversal.reverses_id IS NOT NULL
        AND reversal.dated_on <= ${input.throughDate}::date
    )
    SELECT (
      EXISTS (SELECT 1 FROM core_reversals
        WHERE original_id IS NULL OR original_reverses_id IS NOT NULL OR exact IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM core_reversals GROUP BY kind, reverses_id HAVING count(*) <> 1)
      OR EXISTS (SELECT 1 FROM transfer_reversals
        WHERE original_id IS NULL OR original_reverses_id IS NOT NULL OR exact IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM transfer_reversals GROUP BY reverses_id HAVING count(*) <> 1)
    ) AS invalid
  `);
  if (rowsOf(integrityResult)[0]?.invalid) {
    throw new Error("transparency_reversal_integrity_violation");
  }
  const movementResult = await tx.execute<MovementRow>(sql`
    WITH movements AS (
      SELECT 'contribution'::text AS source_kind, c.id AS source_id, c.dated_on,
        c.member_id, NULL::uuid AS collection_id, c.kind::text AS category,
        'Contribution'::text AS label,
        (CASE WHEN c.reverses_id IS NULL THEN c.amount ELSE -ABS(c.amount) END)::numeric(18,4) AS signed_amount,
        COALESCE(original.reconciliation_status, c.reconciliation_status)::text AS reconciliation_status, c.reverses_id,
        a.name AS account_name
      FROM contribution c
      LEFT JOIN contribution original ON original.org_id = c.org_id AND original.id = c.reverses_id
      LEFT JOIN account a ON a.org_id = c.org_id AND a.id = COALESCE(original.account_id, c.account_id)
      WHERE c.org_id = ${input.orgId}
        AND c.dated_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date
        AND (${memberId}::uuid IS NULL OR c.member_id = ${memberId}::uuid)

      UNION ALL
      SELECT 'repayment', r.id, r.dated_on, r.member_id, NULL::uuid, 'loan_repayment',
        'Loan repayment',
        (CASE WHEN r.reverses_id IS NULL THEN r.amount ELSE -ABS(r.amount) END)::numeric(18,4),
        COALESCE(original.reconciliation_status, r.reconciliation_status)::text, r.reverses_id, a.name
      FROM repayment r
      LEFT JOIN repayment original ON original.org_id = r.org_id AND original.id = r.reverses_id
      LEFT JOIN account a ON a.org_id = r.org_id AND a.id = COALESCE(original.account_id, r.account_id)
      WHERE r.org_id = ${input.orgId}
        AND r.dated_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date
        AND (${memberId}::uuid IS NULL OR r.member_id = ${memberId}::uuid)

      UNION ALL
      SELECT 'withdrawal', w.id, w.dated_on, w.member_id, NULL::uuid, w.kind::text,
        'Withdrawal',
        (CASE WHEN w.reverses_id IS NULL THEN -w.amount ELSE ABS(w.amount) END)::numeric(18,4),
        NULL::text, w.reverses_id, NULL::text
      FROM withdrawal w
      WHERE w.org_id = ${input.orgId}
        AND w.dated_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date
        AND (${memberId}::uuid IS NULL OR w.member_id = ${memberId}::uuid)

      UNION ALL
      SELECT 'loan_disbursement', d.id, d.disbursed_on, l.borrower_member_id, NULL::uuid,
        d.disbursement_source::text, 'Loan disbursement', -d.amount::numeric(18,4),
        NULL::text, NULL::uuid, NULL::text
      FROM loan_disbursement d
      JOIN loan l ON l.org_id = d.org_id AND l.id = d.loan_id
      WHERE d.org_id = ${input.orgId}
        AND d.disbursed_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date
        AND (${memberId}::uuid IS NULL OR l.borrower_member_id = ${memberId}::uuid)

      UNION ALL
      SELECT 'expense', e.id, e.incurred_on, e.beneficiary_member_id, collection.id,
        e.category::text, e.purpose,
        (CASE WHEN e.status <> 'paid' THEN 0
          WHEN e.reverses_id IS NULL THEN -e.amount ELSE ABS(e.amount) END)::numeric(18,4),
        NULL::text, e.reverses_id, a.name
      FROM expense e
      LEFT JOIN account a ON a.org_id = e.org_id AND a.id = e.account_id
      LEFT JOIN extraordinary_collection collection
        ON collection.org_id = e.org_id
        AND collection.paid_out_expense_id = COALESCE(e.reverses_id, e.id)
      WHERE e.org_id = ${input.orgId}
        AND e.incurred_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date

      UNION ALL
      SELECT 'transfer', t.id, t.dated_on, NULL::uuid,
        CASE WHEN t.regularizes_kind = 'extraordinary_collection'
          THEN line.collection_id
          WHEN t.purpose = 'collection_surplus_return' THEN collection.id
          ELSE NULL::uuid END,
        COALESCE(t.purpose, 'transfer'),
        COALESCE(t.purpose, 'Transfer'),
        (CASE
          WHEN destination.is_group_fund AND NOT source.is_group_fund THEN t.amount
          WHEN source.is_group_fund AND NOT destination.is_group_fund THEN -t.amount
          ELSE 0 END)::numeric(18,4),
        NULL::text, t.reverses_id, source.name || ' → ' || destination.name
      FROM transfer t
      JOIN account source ON source.org_id = t.org_id AND source.id = t.from_account_id
      JOIN account destination ON destination.org_id = t.org_id AND destination.id = t.to_account_id
      LEFT JOIN extraordinary_collection_line line
        ON t.regularizes_kind = 'extraordinary_collection'
        AND line.org_id = t.org_id AND line.id = t.regularizes_id
      LEFT JOIN extraordinary_collection collection
        ON t.purpose = 'collection_surplus_return'
        AND collection.org_id = t.org_id AND collection.surplus_transfer_id = t.id
      WHERE t.org_id = ${input.orgId}
        AND t.dated_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date

      UNION ALL
      SELECT 'collection_line', line.id, line.dated_on, line.member_id, line.collection_id,
        collection.kind, collection.purpose,
        (CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END)::numeric(18,4),
        line.reconciliation_status::text, line.reverses_id, a.name
      FROM extraordinary_collection_line line
      JOIN extraordinary_collection collection
        ON collection.org_id = line.org_id AND collection.id = line.collection_id
      JOIN account a ON a.org_id = line.org_id AND a.id = line.account_id
      WHERE line.org_id = ${input.orgId}
        AND line.dated_on BETWEEN ${input.fromDate}::date AND ${input.throughDate}::date
        AND (${memberId}::uuid IS NULL OR line.member_id = ${memberId}::uuid
          OR collection.beneficiary_member_id = ${memberId}::uuid)
    )
    SELECT source_kind AS "sourceKind", source_id AS "sourceId", dated_on AS "datedOn",
      member_id AS "memberId", collection_id AS "collectionId", category, label,
      signed_amount AS "signedAmount", reconciliation_status AS "reconciliationStatus",
      reverses_id AS "reversesId", account_name AS "accountName"
    FROM movements
    ORDER BY dated_on, source_kind, source_id
  `);

  const balanceResult = await tx.execute<BalanceRow>(sql`
    WITH balances AS MATERIALIZED (
      SELECT fund_pool_balance(${input.orgId}, ${input.throughDate}::date) AS core,
        collection_cash_balance(${input.orgId}, ${input.throughDate}::date) AS collection
    )
    SELECT core AS "netFundBalance",
      (core + collection)::numeric(18, 4) AS "physicalCashBalance",
      collection AS "collectionCashBalance",
      core AS "regularizedDistributableBalance"
    FROM balances
  `);
  const balances = rowsOf(balanceResult)[0];
  const rows = rowsOf(movementResult).map((row) => ({
    ...row,
    datedOn: dateString(row.datedOn),
    signedAmount: String(row.signedAmount),
  }));

  return {
    rows,
    netFundBalance: String(balances?.netFundBalance ?? "0.0000"),
    physicalCashBalance: String(balances?.physicalCashBalance ?? "0.0000"),
    collectionCashBalance: String(balances?.collectionCashBalance ?? "0.0000"),
    regularizedDistributableBalance: String(balances?.regularizedDistributableBalance ?? "0.0000"),
  };
}

export function createTransparencyService(): TransparencyService {
  return {
    context: "transparency",
    getPeriod(input) {
      return withTenantTransaction(input.orgId, (tx) => getPeriodTransparency(tx, input));
    },
  };
}
