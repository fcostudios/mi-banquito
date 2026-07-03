ALTER TABLE reconciliation_cycle
  DROP CONSTRAINT IF EXISTS uq_reconciliation_cycle_org_id_cycle_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_cycle_org_cycle_regular
  ON reconciliation_cycle(org_id, cycle_id)
  WHERE resolution_kind <> 'adjustment';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reconciliation_cycle_org_period_close_adjustment
  ON reconciliation_cycle(org_id, period_close_id)
  WHERE resolution_kind = 'adjustment';

ALTER TABLE reconciliation_cycle
  DROP CONSTRAINT IF EXISTS ck_reconciliation_cycle_adjustment_payload;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_reconciliation_cycle_adjustment_payload'
      AND conrelid = 'reconciliation_cycle'::regclass
  ) THEN
    ALTER TABLE reconciliation_cycle
      ADD CONSTRAINT ck_reconciliation_cycle_adjustment_payload CHECK (
        (
          resolution_kind <> 'adjustment'
          AND period_close_id IS NULL
          AND adjustment_reason IS NULL
          AND adjustment_window_opens_at IS NULL
          AND adjustment_window_closes_at IS NULL
        )
        OR (
          resolution_kind = 'adjustment'
          AND period_close_id IS NOT NULL
          AND NULLIF(BTRIM(adjustment_reason), '') IS NOT NULL
          AND adjustment_window_opens_at IS NOT NULL
          AND adjustment_window_closes_at IS NOT NULL
          AND adjustment_window_opens_at < adjustment_window_closes_at
        )
      );
  END IF;
END $$;
