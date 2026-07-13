CREATE TYPE impersonation_termination_kind_enum AS ENUM (
  'operator_exit',
  'expired',
  'revoked'
);

ALTER TABLE user_org_membership
  ADD CONSTRAINT uq_user_org_membership_id_org UNIQUE (id, org_id);

ALTER TABLE impersonation
  ADD COLUMN target_membership_id UUID,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD CONSTRAINT uq_impersonation_id_org UNIQUE (id, org_id),
  ADD CONSTRAINT fk_impersonation_target_membership_org
    FOREIGN KEY (target_membership_id, org_id)
    REFERENCES user_org_membership (id, org_id),
  ADD CONSTRAINT ck_impersonation_read_only_mode CHECK (mode = 'read_only'),
  ADD CONSTRAINT ck_impersonation_expiry_after_start
    CHECK (expires_at IS NULL OR expires_at > started_at);

CREATE INDEX idx_impersonation_active_expiry
  ON impersonation (expires_at, org_id)
  WHERE expires_at IS NOT NULL;

CREATE TABLE impersonation_termination (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  impersonation_id UUID NOT NULL,
  org_id UUID NOT NULL,
  kind impersonation_termination_kind_enum NOT NULL,
  reason TEXT NOT NULL,
  ended_by_operator_id UUID NOT NULL REFERENCES platform_operator(id),
  ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_impersonation_termination_impersonation UNIQUE (impersonation_id),
  CONSTRAINT fk_impersonation_termination_impersonation_org
    FOREIGN KEY (impersonation_id, org_id)
    REFERENCES impersonation (id, org_id)
);

CREATE INDEX idx_impersonation_termination_org_ended
  ON impersonation_termination (org_id, ended_at DESC);

CREATE OR REPLACE FUNCTION raise_append_only_violation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'append_only_violation',
    DETAIL = TG_TABLE_NAME || ' rejects ' || TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS impersonation_no_mutate ON impersonation;
CREATE TRIGGER impersonation_no_mutate BEFORE UPDATE OR DELETE ON impersonation
FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();

DROP TRIGGER IF EXISTS impersonation_termination_no_mutate ON impersonation_termination;
CREATE TRIGGER impersonation_termination_no_mutate BEFORE UPDATE OR DELETE ON impersonation_termination
FOR EACH ROW EXECUTE FUNCTION raise_append_only_violation();

ALTER TABLE impersonation ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation FORCE ROW LEVEL SECURITY;

ALTER TABLE impersonation_termination ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_termination FORCE ROW LEVEL SECURITY;

CREATE POLICY impersonation_termination_tenant_isolation ON impersonation_termination
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
