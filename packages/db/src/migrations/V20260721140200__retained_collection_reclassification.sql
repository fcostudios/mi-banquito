-- US-099: a governed retained surplus becomes core cash on the dated terminal
-- command. The append-only completion audit is the effective-date authority.

CREATE OR REPLACE FUNCTION safe_collection_command_date(payload jsonb)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE value text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  value := payload->>'datedOn';
  IF value IS NULL OR value !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  BEGIN RETURN value::date; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
END; $$;

CREATE OR REPLACE FUNCTION safe_jsonb_object_key_count(payload jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE result integer;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN -1; END IF;
  SELECT count(*)::integer INTO result FROM jsonb_object_keys(payload);
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION safe_collection_positive_amount(payload jsonb, key_name text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE value text;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  value := payload->>key_name;
  IF value IS NULL OR value !~ '^([0-9]+)(\.[0-9]{1,4})?$' THEN RETURN NULL; END IF;
  BEGIN
    IF value::numeric <= 0 THEN RETURN NULL; END IF;
    RETURN value::numeric;
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END;
END; $$;

CREATE OR REPLACE FUNCTION retained_collection_reclassification(
  p_org_id uuid, p_through_date date DEFAULT NULL
) RETURNS numeric(18, 4)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  WITH terminal_audits AS (
    SELECT a.id AS audit_id, a.org_id, a.subject_id AS collection_id, a.actor_id,
      a.actor_kind, a.reason, a.payload_snapshot AS payload,
      safe_collection_command_date(a.payload_snapshot) AS effective_on,
      count(*) OVER (PARTITION BY a.org_id, a.subject_id) AS terminal_event_count
    FROM audit_log_entry a
    WHERE a.org_id = p_org_id
      AND a.action_kind = 'collection.command.completed'
      AND a.subject_kind = 'extraordinary_collection'
      AND a.payload_snapshot->>'command' IN ('cancel', 'payout')
  ), authorized AS (
    SELECT header.surplus_amount
    FROM terminal_audits event
    JOIN extraordinary_collection header
      ON header.org_id = event.org_id AND header.id = event.collection_id
    LEFT JOIN expense payout
      ON payout.org_id = header.org_id AND payout.id = header.paid_out_expense_id
    WHERE event.terminal_event_count = 1
      AND event.effective_on IS NOT NULL
      AND (p_through_date IS NULL OR event.effective_on <= p_through_date)
      AND header.kind = 'solidarity'
      AND header.disposition = 'retained'
      AND header.surplus_amount > 0 AND header.surplus_amount <> 'NaN'::numeric
      AND header.disposition_motive IS NOT NULL
      AND length(btrim(header.disposition_motive)) >= 3
      AND header.surplus_transfer_id IS NULL
      AND event.actor_kind = 'member'
      AND event.reason IS NULL
      AND event.payload->>'collectionId' = header.id::text
      AND event.payload->>'actorId' = event.actor_id::text
      AND event.payload->>'disposition' = 'retained'
      AND event.payload->>'dispositionMotive' = header.disposition_motive
      AND event.payload->'returnAccountId' = 'null'::jsonb
      AND event.payload->>'clientRequestId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND NOT EXISTS (
        SELECT 1 FROM audit_log_entry duplicate
        WHERE duplicate.org_id = event.org_id
          AND duplicate.action_kind = 'collection.command.completed'
          AND duplicate.id <> event.audit_id
          AND duplicate.payload_snapshot->>'clientRequestId' = event.payload->>'clientRequestId'
      )
      AND (
        (event.payload->>'command' = 'cancel'
          AND safe_jsonb_object_key_count(event.payload) = 8
          AND header.status = 'cancelled' AND header.paid_out_expense_id IS NULL)
        OR
        (event.payload->>'command' = 'payout'
          AND safe_jsonb_object_key_count(event.payload) = 10
          AND header.status = 'closed' AND header.paid_out_expense_id IS NOT NULL
          AND payout.status = 'paid' AND payout.category = 'solidarity_payout'
          AND payout.beneficiary_member_id = header.beneficiary_member_id
          AND event.payload->>'sourceAccountId' = payout.account_id::text
          AND safe_collection_positive_amount(event.payload, 'payoutAmount') = payout.amount)
      )
  )
  SELECT COALESCE(SUM(surplus_amount), 0)::numeric(18, 4) FROM authorized;
$$;

CREATE OR REPLACE FUNCTION fund_pool_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4) LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT (COALESCE(SUM(delta), 0) + retained_collection_reclassification(p_org_id, p_through_date))::NUMERIC(18, 4)
  FROM (
    SELECT CASE WHEN c.reverses_id IS NULL THEN c.amount ELSE -ABS(c.amount) END AS delta
    FROM contribution c
    LEFT JOIN contribution original ON original.id = c.reverses_id AND original.org_id = c.org_id
    LEFT JOIN account a ON a.id = COALESCE(original.account_id, c.account_id) AND a.org_id = c.org_id
    WHERE c.org_id = p_org_id AND COALESCE(original.reconciliation_status, c.reconciliation_status) = 'regularized'
      AND (COALESCE(original.account_id, c.account_id) IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR c.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN r.reverses_id IS NULL THEN r.amount ELSE -ABS(r.amount) END
    FROM repayment r
    LEFT JOIN repayment original ON original.id = r.reverses_id AND original.org_id = r.org_id
    LEFT JOIN account a ON a.id = COALESCE(original.account_id, r.account_id) AND a.org_id = r.org_id
    WHERE r.org_id = p_org_id AND COALESCE(original.reconciliation_status, r.reconciliation_status) = 'regularized'
      AND (COALESCE(original.account_id, r.account_id) IS NULL OR a.is_group_fund = true)
      AND (p_through_date IS NULL OR r.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN destination.is_group_fund AND NOT source.is_group_fund THEN t.amount
      WHEN source.is_group_fund AND NOT destination.is_group_fund THEN -t.amount ELSE 0 END
    FROM transfer t
    JOIN account source ON source.id = t.from_account_id AND source.org_id = t.org_id
    JOIN account destination ON destination.id = t.to_account_id AND destination.org_id = t.org_id
    WHERE t.org_id = p_org_id AND t.purpose IS DISTINCT FROM 'collection_surplus_return'
      AND NOT (t.purpose = 'regularization' AND t.regularizes_kind = 'extraordinary_collection')
      AND NOT EXISTS (SELECT 1 FROM transfer original WHERE original.org_id = t.org_id
        AND original.id = t.reverses_id AND original.purpose = 'regularization'
        AND original.regularizes_kind = 'extraordinary_collection')
      AND (p_through_date IS NULL OR t.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN w.reverses_id IS NULL THEN -w.amount ELSE ABS(w.amount) END FROM withdrawal w
    WHERE w.org_id = p_org_id AND (p_through_date IS NULL OR w.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN e.reverses_id IS NULL THEN -e.amount ELSE ABS(e.amount) END
    FROM expense e LEFT JOIN expense original ON original.id = e.reverses_id AND original.org_id = e.org_id
    WHERE e.org_id = p_org_id AND COALESCE(original.status, e.status) = 'paid'
      AND COALESCE(original.category, e.category) <> 'solidarity_payout'
      AND (p_through_date IS NULL OR e.incurred_on <= p_through_date)
    UNION ALL
    SELECT -d.amount FROM loan_disbursement d WHERE d.org_id = p_org_id
      AND (p_through_date IS NULL OR d.disbursed_on <= p_through_date)
  ) core_delta;
$$;

CREATE OR REPLACE FUNCTION collection_cash_balance(p_org_id UUID, p_through_date DATE DEFAULT NULL)
RETURNS NUMERIC(18, 4) LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT (COALESCE(SUM(delta), 0) - retained_collection_reclassification(p_org_id, p_through_date))::NUMERIC(18, 4)
  FROM (
    SELECT CASE WHEN line.reverses_id IS NULL THEN line.amount ELSE -ABS(line.amount) END AS delta
    FROM extraordinary_collection_line line WHERE line.org_id = p_org_id
      AND line.reconciliation_status = 'regularized'
      AND (p_through_date IS NULL OR line.dated_on <= p_through_date)
    UNION ALL
    SELECT CASE WHEN payout.reverses_id IS NULL THEN -payout.amount ELSE ABS(payout.amount) END
    FROM expense payout JOIN extraordinary_collection collection ON collection.org_id = payout.org_id
      AND collection.paid_out_expense_id = COALESCE(payout.reverses_id, payout.id)
    WHERE payout.org_id = p_org_id AND payout.status = 'paid' AND payout.category = 'solidarity_payout'
      AND (p_through_date IS NULL OR payout.incurred_on <= p_through_date)
    UNION ALL
    SELECT -return_transfer.amount FROM transfer return_transfer
    JOIN extraordinary_collection collection ON collection.org_id = return_transfer.org_id
      AND collection.surplus_transfer_id = return_transfer.id
    WHERE return_transfer.org_id = p_org_id AND return_transfer.purpose = 'collection_surplus_return'
      AND (p_through_date IS NULL OR return_transfer.dated_on <= p_through_date)
  ) collection_delta;
$$;
