CREATE OR REPLACE FUNCTION enforce_period_lock() RETURNS trigger AS $$
DECLARE
  movement_date DATE;
  movement_cycle_id UUID;
  locked_period_close_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'contribution' THEN
    movement_date := NEW.dated_on;
    movement_cycle_id := NEW.cycle_id;
  ELSIF TG_TABLE_NAME IN ('withdrawal', 'repayment') THEN
    movement_date := NEW.dated_on;
    movement_cycle_id := NULL;
  ELSIF TG_TABLE_NAME = 'expense' THEN
    movement_date := NEW.incurred_on;
    movement_cycle_id := NULL;
  ELSIF TG_TABLE_NAME = 'interest_accrual' THEN
    movement_date := NEW.accrued_on;
    movement_cycle_id := NULL;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'period_lock_unsupported_table',
      DETAIL = TG_TABLE_NAME;
  END IF;

  SELECT pc.id
    INTO locked_period_close_id
  FROM period_close pc
  JOIN contribution_cycle cc
    ON cc.id = pc.cycle_id
   AND cc.org_id = pc.org_id
  WHERE pc.org_id = NEW.org_id
    AND movement_date <= pc.closed_at::date
    AND (
      (movement_cycle_id IS NOT NULL AND pc.cycle_id = movement_cycle_id)
      OR
      (movement_cycle_id IS NULL AND movement_date BETWEEN cc.opens_on AND cc.closes_on)
    )
  ORDER BY pc.closed_at DESC, pc.id
  LIMIT 1;

  IF locked_period_close_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.adjustment_cycle_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM reconciliation_cycle rc
      WHERE rc.id = NEW.adjustment_cycle_id
        AND rc.org_id = NEW.org_id
        AND rc.resolution_kind = 'adjustment'
        AND rc.period_close_id = locked_period_close_id
        AND rc.adjustment_window_opens_at IS NOT NULL
        AND rc.adjustment_window_closes_at IS NOT NULL
        AND now() >= rc.adjustment_window_opens_at
        AND now() < rc.adjustment_window_closes_at
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'period_locked',
    DETAIL = TG_TABLE_NAME || ' rejects movement dated ' || movement_date;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contribution_period_lock ON contribution;
DROP TRIGGER IF EXISTS withdrawal_period_lock ON withdrawal;
DROP TRIGGER IF EXISTS expense_period_lock ON expense;
DROP TRIGGER IF EXISTS repayment_period_lock ON repayment;
DROP TRIGGER IF EXISTS interest_accrual_period_lock ON interest_accrual;

CREATE TRIGGER contribution_period_lock BEFORE INSERT ON contribution
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER withdrawal_period_lock BEFORE INSERT ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER expense_period_lock BEFORE INSERT ON expense
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER repayment_period_lock BEFORE INSERT ON repayment
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER interest_accrual_period_lock BEFORE INSERT ON interest_accrual
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
