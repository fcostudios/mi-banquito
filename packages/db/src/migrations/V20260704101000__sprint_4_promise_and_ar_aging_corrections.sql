DO $$
DECLARE
  existing_superseded_fk TEXT;
BEGIN
  FOR existing_superseded_fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'promise'::regclass
      AND c.confrelid = 'promise'::regclass
      AND a.attname = 'superseded_by_id'
      AND c.conname <> 'fk_promise_superseded_by'
  LOOP
    EXECUTE format('ALTER TABLE promise DROP CONSTRAINT %I', existing_superseded_fk);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'promise'::regclass
      AND conname = 'fk_promise_superseded_by'
  ) THEN
    ALTER TABLE promise
      ADD CONSTRAINT fk_promise_superseded_by
      FOREIGN KEY (superseded_by_id) REFERENCES promise(id);
  END IF;
END $$;

DROP MATERIALIZED VIEW IF EXISTS mv_ar_aging;
CREATE MATERIALIZED VIEW mv_ar_aging AS
WITH contribution_obligations AS (
  SELECT
    cc.org_id,
    m.id AS member_id,
    m.display_name AS member_name,
    m.whatsapp_number,
    'aporte'::text AS reason_kind,
    cc.id AS cycle_id,
    NULL::uuid AS loan_id,
    cc.cycle_label AS period_label,
    cc.closes_on AS due_date,
    GREATEST((CURRENT_DATE - cc.closes_on), 0)::integer AS days_late,
    GREATEST(
      cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0),
      0
    )::NUMERIC(18, 4) AS amount_due,
    MAX(c.recorded_at) AS last_action_at
  FROM contribution_cycle cc
  JOIN member m
    ON m.org_id = cc.org_id
  LEFT JOIN contribution c
    ON c.org_id = cc.org_id
   AND c.cycle_id = cc.id
   AND c.member_id = m.id
  WHERE cc.closes_on < CURRENT_DATE
  GROUP BY
    cc.org_id,
    m.id,
    m.display_name,
    m.whatsapp_number,
    cc.id,
    cc.cycle_label,
    cc.closes_on,
    cc.expected_amount_per_member
  HAVING GREATEST(cc.expected_amount_per_member - COALESCE(SUM(c.amount), 0), 0) > 0
),
loan_obligations AS (
  SELECT
    ls.org_id,
    COALESCE(l.borrower_member_id, guarantor.guarantor_member_id, repayment_summary.member_id) AS member_id,
    CASE
      WHEN l.borrower_kind = 'non_member' THEN COALESCE(nmb.display_name, m.display_name)
      ELSE m.display_name
    END AS member_name,
    CASE
      WHEN l.borrower_kind = 'non_member' THEN COALESCE(nmb.whatsapp_number, m.whatsapp_number)
      ELSE m.whatsapp_number
    END AS whatsapp_number,
    'cuota'::text AS reason_kind,
    NULL::uuid AS cycle_id,
    l.id AS loan_id,
    ls.period_index::text AS period_label,
    ls.due_on AS due_date,
    GREATEST((CURRENT_DATE - ls.due_on), 0)::integer AS days_late,
    GREATEST(
      (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date),
      0
    )::NUMERIC(18, 4) AS amount_due,
    repayment_summary.last_action_at
  FROM loan_schedule ls
  JOIN loan l
    ON l.id = ls.loan_id
   AND l.org_id = ls.org_id
  LEFT JOIN LATERAL (
    SELECT
      MAX(r.member_id::text)::uuid AS member_id,
      MAX(r.recorded_at) AS last_action_at
    FROM repayment r
    WHERE r.org_id = ls.org_id
      AND r.loan_id = l.id
  ) repayment_summary ON TRUE
  LEFT JOIN LATERAL (
    SELECT lg.guarantor_member_id
    FROM loan_guarantor lg
    WHERE lg.org_id = ls.org_id
      AND lg.loan_id = l.id
      AND lg.released_at IS NULL
    ORDER BY lg.assumed_at DESC, lg.created_at DESC, lg.id DESC
    LIMIT 1
  ) guarantor ON TRUE
  LEFT JOIN member m
    ON m.id = COALESCE(l.borrower_member_id, guarantor.guarantor_member_id, repayment_summary.member_id)
   AND m.org_id = ls.org_id
  LEFT JOIN non_member_borrower nmb
    ON nmb.id = l.borrower_non_member_id
   AND nmb.org_id = ls.org_id
  WHERE ls.due_on < CURRENT_DATE
    AND ls.status IN ('pendiente', 'parcial', 'atrasado', 'en_mora')
  GROUP BY
    ls.org_id,
    l.borrower_kind,
    l.borrower_member_id,
    guarantor.guarantor_member_id,
    repayment_summary.member_id,
    repayment_summary.last_action_at,
    m.display_name,
    m.whatsapp_number,
    nmb.display_name,
    nmb.whatsapp_number,
    l.id,
    ls.period_index,
    ls.due_on,
    ls.principal_due,
    ls.interest_due,
    ls.paid_principal_to_date,
    ls.paid_interest_to_date
  HAVING GREATEST(
    (ls.principal_due + ls.interest_due) - (ls.paid_principal_to_date + ls.paid_interest_to_date),
    0
  ) > 0
)
SELECT * FROM contribution_obligations
UNION ALL
SELECT * FROM loan_obligations;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_ar_aging_unique_obligation
  ON mv_ar_aging(
    org_id,
    reason_kind,
    COALESCE(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_label
  );
