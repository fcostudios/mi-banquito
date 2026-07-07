ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS auth0_org_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_auth0_org_id
  ON organization(auth0_org_id)
  WHERE auth0_org_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_admin_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  action_kind text NOT NULL,
  target_email text NOT NULL,
  target_user_id uuid REFERENCES user_account(id),
  actor_kind text NOT NULL,
  actor_id uuid NOT NULL,
  provider_request_id text,
  status text NOT NULL,
  error_message text,
  created_at timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_admin_action_org_email_kind_created
  ON auth_admin_action(org_id, target_email, action_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_admin_action_target_user
  ON auth_admin_action(target_user_id);

ALTER TABLE auth_admin_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_admin_action FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_admin_action_tenant_isolation ON auth_admin_action;
CREATE POLICY auth_admin_action_tenant_isolation ON auth_admin_action
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
