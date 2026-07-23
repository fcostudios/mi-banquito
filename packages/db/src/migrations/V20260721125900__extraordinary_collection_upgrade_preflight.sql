-- Fail before CHG-011 constraints are installed when legacy rows need an
-- operator-authored repair. Fiscal-year attribution must never be inferred
-- from opened_on; repair the source data explicitly, then rerun migrations.
DO $$
DECLARE
  has_recognition_year boolean;
  invalid_recognition boolean := false;
  invalid_status_expense boolean := false;
BEGIN
  IF to_regclass('public.extraordinary_collection') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'extraordinary_collection'
      AND column_name = 'recognition_fiscal_year'
  ) INTO has_recognition_year;

  IF has_recognition_year THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1 FROM public.extraordinary_collection
        WHERE kind = 'treasurer_recognition' AND recognition_fiscal_year IS NULL
      )
    $query$ INTO invalid_recognition;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.extraordinary_collection
      WHERE kind = 'treasurer_recognition'
    ) INTO invalid_recognition;
  END IF;

  IF invalid_recognition THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_recognition_year_required',
      DETAIL = 'Set recognition_fiscal_year explicitly from the governing fiscal record; do not infer it from opened_on.',
      HINT = 'Repair or cancel/recreate each legacy treasurer_recognition collection, then rerun migrations.',
      ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.extraordinary_collection
    WHERE
      (kind = 'treasurer_recognition' AND paid_out_expense_id IS NOT NULL)
      OR (status IN ('open', 'collecting', 'cancelled') AND paid_out_expense_id IS NOT NULL)
      OR (kind = 'solidarity' AND status IN ('paid_out', 'closed') AND paid_out_expense_id IS NULL)
  ) INTO invalid_status_expense;

  IF invalid_status_expense THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_status_expense_shape_invalid',
      DETAIL = 'Legacy status and paid_out_expense_id values violate the CHG-011 lifecycle shape.',
      HINT = 'Repair the collection lifecycle and linked paid solidarity expense explicitly, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
END;
$$;
