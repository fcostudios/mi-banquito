-- US-099 additive repair: a retained payout reclassification is recognized
-- only when the completion command date is the bound paid expense ledger date.

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
          AND event.effective_on = payout.incurred_on
          AND event.payload->>'sourceAccountId' = payout.account_id::text
          AND safe_collection_positive_amount(event.payload, 'payoutAmount') = payout.amount)
      )
  )
  SELECT COALESCE(SUM(surplus_amount), 0)::numeric(18, 4) FROM authorized;
$$;
