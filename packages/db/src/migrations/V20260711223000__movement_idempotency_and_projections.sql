ALTER TABLE transfer
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE slip_photo
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS idx_contribution_org_account
  ON contribution(org_id, account_id);

CREATE INDEX IF NOT EXISTS idx_repayment_org_account
  ON repayment(org_id, account_id);

CREATE INDEX IF NOT EXISTS idx_transfer_org_from_account
  ON transfer(org_id, from_account_id);

CREATE INDEX IF NOT EXISTS idx_transfer_org_to_account
  ON transfer(org_id, to_account_id);

CREATE INDEX IF NOT EXISTS idx_slip_photo_org_uri
  ON slip_photo(org_id, uri);

CREATE OR REPLACE FUNCTION refresh_movement_read_models() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_available_capital;
  REFRESH MATERIALIZED VIEW mv_liquidez_proyectada;
END;
$$;
