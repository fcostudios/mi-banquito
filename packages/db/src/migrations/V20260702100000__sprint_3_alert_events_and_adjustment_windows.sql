ALTER TYPE reconciliation_cycle_resolution_kind_enum ADD VALUE IF NOT EXISTS 'adjustment';

CREATE TABLE IF NOT EXISTS alert_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  alert_id UUID NOT NULL REFERENCES alert(id),
  action_kind TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ,
  actor_id UUID NOT NULL,
  actor_kind TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_alert_action_kind CHECK (action_kind IN ('dismiss','snooze')),
  CONSTRAINT ck_alert_action_snooze_payload CHECK (
    (action_kind = 'snooze' AND snoozed_until IS NOT NULL)
    OR (action_kind = 'dismiss' AND snoozed_until IS NULL)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_alert_action_kind'
      AND conrelid = 'alert_action'::regclass
  ) THEN
    ALTER TABLE alert_action
      ADD CONSTRAINT ck_alert_action_kind CHECK (action_kind IN ('dismiss','snooze'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_alert_action_snooze_payload'
      AND conrelid = 'alert_action'::regclass
  ) THEN
    ALTER TABLE alert_action
      ADD CONSTRAINT ck_alert_action_snooze_payload CHECK (
        (action_kind = 'snooze' AND snoozed_until IS NOT NULL)
        OR (action_kind = 'dismiss' AND snoozed_until IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alert_action_org_alert_created
  ON alert_action(org_id, alert_id, created_at DESC);

ALTER TABLE reconciliation_cycle
  ADD COLUMN IF NOT EXISTS period_close_id UUID REFERENCES period_close(id),
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_window_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjustment_window_closes_at TIMESTAMPTZ;

ALTER TABLE contribution ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE withdrawal ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE expense ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE repayment ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);
ALTER TABLE interest_accrual ADD COLUMN IF NOT EXISTS adjustment_cycle_id UUID REFERENCES reconciliation_cycle(id);

ALTER TABLE alert_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_action FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_action_tenant_isolation ON alert_action
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
