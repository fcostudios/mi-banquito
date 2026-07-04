ALTER TABLE promise
  ADD COLUMN IF NOT EXISTS period_label TEXT;

UPDATE promise
SET period_label = 'legacy'
WHERE period_label IS NULL;

ALTER TABLE promise
  ALTER COLUMN period_label SET NOT NULL;

DROP INDEX IF EXISTS uq_promise_open_obligation;

CREATE UNIQUE INDEX IF NOT EXISTS uq_promise_open_obligation
  ON promise(
    org_id,
    member_id,
    COALESCE(loan_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_label
  )
  WHERE status = 'open';
