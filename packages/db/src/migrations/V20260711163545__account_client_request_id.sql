ALTER TABLE account
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_org_client_request
  ON account(org_id, client_request_id);
