DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM extraordinary_collection collection
    WHERE collection.beneficiary_member_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM member m
        WHERE m.id = collection.beneficiary_member_id AND m.org_id = collection.org_id
      )
  ) OR EXISTS (
    SELECT 1 FROM extraordinary_collection_line line
    WHERE NOT EXISTS (
      SELECT 1 FROM member m WHERE m.id = line.member_id AND m.org_id = line.org_id
    ) OR NOT EXISTS (
      SELECT 1 FROM account a WHERE a.id = line.account_id AND a.org_id = line.org_id
    )
  ) OR EXISTS (
    SELECT 1 FROM expense e
    WHERE e.beneficiary_member_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM member m
        WHERE m.id = e.beneficiary_member_id AND m.org_id = e.org_id
      )
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_cross_tenant_reference',
      HINT = 'Repair beneficiary, line member, and line account references to same-org rows, then rerun migrations.',
      ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM extraordinary_collection
    WHERE target_amount = 'NaN'::numeric OR surplus_amount = 'NaN'::numeric
  ) OR EXISTS (
    SELECT 1 FROM extraordinary_collection_line WHERE amount = 'NaN'::numeric
  ) OR EXISTS (
    SELECT 1 FROM transfer WHERE amount = 'NaN'::numeric
  ) OR EXISTS (
    SELECT 1 FROM expense WHERE amount = 'NaN'::numeric
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'collection_upgrade_non_finite_money',
      HINT = 'Replace every numeric NaN with an explicitly reviewed finite decimal value, then rerun migrations.',
      ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE member
  ADD CONSTRAINT uq_member_org_id_id UNIQUE (org_id, id);
ALTER TABLE account
  ADD CONSTRAINT uq_account_org_id_id UNIQUE (org_id, id);

ALTER TABLE extraordinary_collection
  ADD CONSTRAINT fk_extraordinary_collection_beneficiary_org
    FOREIGN KEY (org_id, beneficiary_member_id) REFERENCES member(org_id, id);
ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT fk_extraordinary_collection_line_member_org
    FOREIGN KEY (org_id, member_id) REFERENCES member(org_id, id),
  ADD CONSTRAINT fk_extraordinary_collection_line_account_org
    FOREIGN KEY (org_id, account_id) REFERENCES account(org_id, id);
ALTER TABLE expense
  ADD CONSTRAINT fk_expense_beneficiary_org
    FOREIGN KEY (org_id, beneficiary_member_id) REFERENCES member(org_id, id);

ALTER TABLE extraordinary_collection
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_target_nonnegative,
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_surplus_finite;
ALTER TABLE extraordinary_collection
  ADD CONSTRAINT ck_extraordinary_collection_target_nonnegative CHECK (
    target_amount IS NULL OR (target_amount <> 'NaN'::numeric AND target_amount >= 0)
  ),
  ADD CONSTRAINT ck_extraordinary_collection_surplus_finite CHECK (
    surplus_amount IS NULL OR surplus_amount <> 'NaN'::numeric
  );

ALTER TABLE extraordinary_collection_line
  DROP CONSTRAINT IF EXISTS ck_extraordinary_collection_line_amount_nonnegative;
ALTER TABLE extraordinary_collection_line
  ADD CONSTRAINT ck_extraordinary_collection_line_amount_nonnegative CHECK (
    amount <> 'NaN'::numeric AND amount >= 0
  );

ALTER TABLE transfer
  DROP CONSTRAINT IF EXISTS ck_transfer_amount_finite,
  DROP CONSTRAINT IF EXISTS ck_transfer_regularization_amount_positive;
ALTER TABLE transfer
  ADD CONSTRAINT ck_transfer_amount_finite CHECK (amount <> 'NaN'::numeric),
  ADD CONSTRAINT ck_transfer_regularization_amount_positive CHECK ((
    purpose IS DISTINCT FROM 'regularization'
    OR (amount <> 'NaN'::numeric AND amount > 0)
  ) IS TRUE);

ALTER TABLE expense DROP CONSTRAINT IF EXISTS ck_expense_amount_finite;
ALTER TABLE expense
  ADD CONSTRAINT ck_expense_amount_finite CHECK (amount <> 'NaN'::numeric);

CREATE OR REPLACE FUNCTION enforce_collection_finite_money() RETURNS trigger AS $$
BEGIN
  IF NEW.surplus_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION USING MESSAGE = 'collection_money_not_finite', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS ab_collection_finite_money_guard ON extraordinary_collection;
CREATE TRIGGER ab_collection_finite_money_guard
  BEFORE INSERT OR UPDATE ON extraordinary_collection
  FOR EACH ROW EXECUTE FUNCTION enforce_collection_finite_money();

CREATE OR REPLACE FUNCTION enforce_transfer_finite_money() RETURNS trigger AS $$
BEGIN
  IF NEW.amount = 'NaN'::numeric THEN
    IF NEW.purpose = 'regularization' THEN
      RAISE EXCEPTION USING MESSAGE = 'regularization_amount_invalid', ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION USING MESSAGE = 'transfer_money_not_finite', ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS ab_transfer_finite_money_guard ON transfer;
CREATE TRIGGER ab_transfer_finite_money_guard
  BEFORE INSERT OR UPDATE ON transfer
  FOR EACH ROW EXECUTE FUNCTION enforce_transfer_finite_money();

ALTER FUNCTION allow_extraordinary_collection_line_regularization()
  SET search_path = pg_catalog, public;

DROP INDEX IF EXISTS uq_extraordinary_collection_line_reverses;
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraordinary_collection_line_reverses
  ON extraordinary_collection_line(reverses_id)
  WHERE reverses_id IS NOT NULL;
