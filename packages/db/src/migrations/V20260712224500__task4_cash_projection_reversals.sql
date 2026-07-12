CREATE OR REPLACE FUNCTION current_cash_balances(p_org_id UUID)
RETURNS TABLE(bank_balance NUMERIC(18, 4), petty_cash_balance NUMERIC(18, 4))
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cash_delta AS (
    SELECT
      c.amount AS delta,
      CASE
        WHEN a.is_group_fund = true AND a.type = 'group_bank' THEN 'bank'
        WHEN a.is_group_fund = true AND a.type = 'cash_box' THEN 'cash'
        WHEN c.account_id IS NULL AND c.payment_source = 'bank_transfer' THEN 'bank'
        WHEN c.account_id IS NULL AND c.payment_source IN ('cash_in_meeting', 'petty_cash_deposit') THEN 'cash'
      END AS bucket
    FROM contribution c
    LEFT JOIN account a ON a.org_id = c.org_id AND a.id = c.account_id
    WHERE c.org_id = p_org_id
      AND c.reverses_id IS NULL
      AND c.reconciliation_status = 'regularized'
      AND NOT EXISTS (
        SELECT 1 FROM contribution reversal
        WHERE reversal.org_id = c.org_id AND reversal.reverses_id = c.id
      )

    UNION ALL

    SELECT
      r.amount,
      CASE
        WHEN a.is_group_fund = true AND a.type = 'group_bank' THEN 'bank'
        WHEN a.is_group_fund = true AND a.type = 'cash_box' THEN 'cash'
        WHEN r.account_id IS NULL THEN 'bank'
      END
    FROM repayment r
    LEFT JOIN account a ON a.org_id = r.org_id AND a.id = r.account_id
    WHERE r.org_id = p_org_id
      AND r.reverses_id IS NULL
      AND r.reconciliation_status = 'regularized'
      AND NOT EXISTS (
        SELECT 1 FROM repayment reversal
        WHERE reversal.org_id = r.org_id AND reversal.reverses_id = r.id
      )

    UNION ALL

    SELECT account_delta.delta, account_delta.bucket
    FROM transfer t
    JOIN account source ON source.org_id = t.org_id AND source.id = t.from_account_id
    JOIN account destination ON destination.org_id = t.org_id AND destination.id = t.to_account_id
    CROSS JOIN LATERAL (VALUES
      (
        CASE WHEN source.is_group_fund THEN -t.amount ELSE 0 END,
        CASE
          WHEN source.is_group_fund AND source.type = 'group_bank' THEN 'bank'
          WHEN source.is_group_fund AND source.type = 'cash_box' THEN 'cash'
        END
      ),
      (
        CASE WHEN destination.is_group_fund THEN t.amount ELSE 0 END,
        CASE
          WHEN destination.is_group_fund AND destination.type = 'group_bank' THEN 'bank'
          WHEN destination.is_group_fund AND destination.type = 'cash_box' THEN 'cash'
        END
      )
    ) AS account_delta(delta, bucket)
    WHERE t.org_id = p_org_id
      AND t.reverses_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transfer reversal
        WHERE reversal.org_id = t.org_id AND reversal.reverses_id = t.id
      )

    UNION ALL

    SELECT
      -e.amount,
      CASE
        WHEN a.is_group_fund = true AND a.type = 'group_bank' THEN 'bank'
        WHEN a.is_group_fund = true AND a.type = 'cash_box' THEN 'cash'
      END
    FROM expense e
    JOIN account a ON a.org_id = e.org_id AND a.id = e.account_id
    WHERE e.org_id = p_org_id
      AND e.status = 'paid'
      AND e.reverses_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM expense reversal
        WHERE reversal.org_id = e.org_id AND reversal.reverses_id = e.id
      )

    UNION ALL

    SELECT
      -d.amount,
      CASE WHEN d.disbursement_source = 'petty_cash' THEN 'cash' ELSE 'bank' END
    FROM loan_disbursement d
    WHERE d.org_id = p_org_id
  )
  SELECT
    COALESCE(SUM(delta) FILTER (WHERE bucket = 'bank'), 0)::NUMERIC(18, 4),
    COALESCE(SUM(delta) FILTER (WHERE bucket = 'cash'), 0)::NUMERIC(18, 4)
  FROM cash_delta;
$$;

DROP MATERIALIZED VIEW IF EXISTS mv_cash_balances;

CREATE MATERIALIZED VIEW mv_cash_balances AS
SELECT
  organization.id AS org_id,
  balances.bank_balance,
  balances.petty_cash_balance,
  now() AS refreshed_at
FROM organization
CROSS JOIN LATERAL current_cash_balances(organization.id) balances;

CREATE UNIQUE INDEX idx_mv_cash_balances_org_id
  ON mv_cash_balances(org_id);

REFRESH MATERIALIZED VIEW mv_cash_balances;
