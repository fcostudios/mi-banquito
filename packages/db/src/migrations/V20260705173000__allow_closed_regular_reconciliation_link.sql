ALTER TABLE reconciliation_cycle
  DROP CONSTRAINT IF EXISTS ck_reconciliation_cycle_adjustment_payload;

ALTER TABLE reconciliation_cycle
  ADD CONSTRAINT ck_reconciliation_cycle_adjustment_payload CHECK (
    (
      resolution_kind <> 'adjustment'
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
