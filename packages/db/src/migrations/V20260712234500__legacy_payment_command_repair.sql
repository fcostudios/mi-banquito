DO $$
DECLARE tenant uuid;
BEGIN
  FOR tenant IN SELECT id FROM organization LOOP
    PERFORM set_config('app.current_org_id', tenant::text, true);

    WITH legacy_receipt AS (
      SELECT
        pr.id,
        pr.org_id,
        pr.created_by,
        pr.member_id,
        pr.amount,
        pr.dated_on,
        pr.received_via,
        pr.slip_photo_id,
        NULLIF(BTRIM(pr.notes), '') AS notes,
        pr.extra_decision,
        source_account.account_id
      FROM payment_receipt pr
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT source.account_id) AS account_count,
          CASE WHEN COUNT(DISTINCT source.account_id) = 1 THEN MIN(source.account_id) END AS account_id
        FROM (
          SELECT contribution.account_id::text AS account_id
          FROM contribution
          WHERE contribution.org_id = pr.org_id
            AND contribution.payment_receipt_id = pr.id
            AND contribution.account_id IS NOT NULL
          UNION ALL
          SELECT repayment.account_id::text AS account_id
          FROM repayment
          WHERE repayment.org_id = pr.org_id
            AND repayment.payment_receipt_id = pr.id
            AND repayment.account_id IS NOT NULL
        ) source
      ) source_account ON true
      WHERE pr.org_id = tenant
        AND (
          pr.command_payload IS NULL
          OR pr.command_payload = jsonb_build_object(
            'orgId', pr.org_id,
            'actorId', pr.created_by,
            'accountId', pr.account_id,
            'memberId', pr.member_id,
            'amount', pr.amount::text,
            'datedOn', pr.dated_on::text,
            'receivedVia', pr.received_via,
            'slipPhotoId', pr.slip_photo_id,
            'notes', NULLIF(BTRIM(pr.notes), ''),
            'extraDecision', pr.extra_decision,
            'targetLoanId', NULL,
            'targetCycleId', NULL,
            'overrideReason', NULL
          )
        )
    )
    UPDATE payment_receipt pr
    SET command_payload = jsonb_build_object(
      'kind', 'legacy_payment_command_v1',
      'legacy', true,
      'known', jsonb_build_object(
        'orgId', legacy.org_id,
        'actorId', legacy.created_by,
        'memberId', legacy.member_id,
        'amount', legacy.amount::text,
        'datedOn', legacy.dated_on::text,
        'receivedVia', legacy.received_via,
        'slipPhotoId', legacy.slip_photo_id,
        'notes', legacy.notes,
        'extraDecision', legacy.extra_decision
      )
      || CASE WHEN legacy.account_id IS NOT NULL THEN jsonb_build_object('accountId', legacy.account_id) ELSE '{}'::jsonb END,
      'unknownFields', to_jsonb(array_remove(ARRAY[
        CASE WHEN legacy.account_id IS NULL THEN 'accountId' END,
        'targetLoanId',
        'targetCycleId',
        'overrideReason'
      ]::text[], NULL))
    )
    FROM legacy_receipt legacy
    WHERE pr.id = legacy.id AND pr.org_id = legacy.org_id;
  END LOOP;
  PERFORM set_config('app.current_org_id', '', true);
END;
$$;
