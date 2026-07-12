DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statement_artifact_status_enum') THEN
    CREATE TYPE statement_artifact_status_enum AS ENUM ('pending', 'failed', 'ready');
  END IF;
END;
$$;

ALTER TABLE payment_receipt
  ADD COLUMN IF NOT EXISTS command_payload jsonb;

DO $$
DECLARE tenant uuid;
BEGIN
  FOR tenant IN SELECT id FROM organization LOOP
    PERFORM set_config('app.current_org_id', tenant::text, true);
    UPDATE payment_receipt
    SET command_payload = jsonb_build_object(
      'orgId', org_id,
      'actorId', created_by,
      'accountId', account_id,
      'memberId', member_id,
      'amount', amount::text,
      'datedOn', dated_on::text,
      'receivedVia', received_via,
      'slipPhotoId', slip_photo_id,
      'notes', NULLIF(BTRIM(notes), ''),
      'extraDecision', extra_decision,
      'targetLoanId', NULL,
      'targetCycleId', NULL,
      'overrideReason', NULL
    )
    WHERE org_id = tenant AND command_payload IS NULL;
  END LOOP;
  PERFORM set_config('app.current_org_id', '', true);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'statement_archive'::regclass
      AND conname = 'uq_statement_archive_org_id_id'
  ) THEN
    ALTER TABLE statement_archive
      ADD CONSTRAINT uq_statement_archive_org_id_id UNIQUE (org_id, id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS statement_artifact_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  statement_archive_id uuid NOT NULL,
  status statement_artifact_status_enum NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  byte_size integer CHECK (byte_size IS NULL OR byte_size >= 0),
  error_code text,
  attempted_at timestamp NOT NULL,
  created_at timestamp NOT NULL,
  CONSTRAINT uq_statement_artifact_event_attempt
    UNIQUE (org_id, statement_archive_id, attempt_number, status),
  CONSTRAINT ck_statement_artifact_event_ready_size
    CHECK (status <> 'ready' OR byte_size IS NOT NULL),
  CONSTRAINT fk_statement_artifact_event_archive_org
    FOREIGN KEY (org_id, statement_archive_id) REFERENCES statement_archive(org_id, id)
);

CREATE INDEX IF NOT EXISTS idx_statement_artifact_event_archive_created
  ON statement_artifact_event(org_id, statement_archive_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_statement_artifact_event_ready
  ON statement_artifact_event(org_id, statement_archive_id)
  WHERE status = 'ready';

CREATE OR REPLACE FUNCTION statement_artifact_event_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'append_only: % is forbidden on statement_artifact_event', TG_OP; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS statement_artifact_event_no_mutate ON statement_artifact_event;
CREATE TRIGGER statement_artifact_event_no_mutate
  BEFORE UPDATE OR DELETE ON statement_artifact_event
  FOR EACH ROW EXECUTE FUNCTION statement_artifact_event_append_only();

ALTER TABLE statement_artifact_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_artifact_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS statement_artifact_event_tenant_isolation ON statement_artifact_event;
CREATE POLICY statement_artifact_event_tenant_isolation ON statement_artifact_event
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE statement_archive
  ADD COLUMN IF NOT EXISTS legacy_verification_payload jsonb;

ALTER TABLE statement_archive DISABLE TRIGGER statement_archive_no_mutate;
DO $$
DECLARE tenant uuid;
BEGIN
  FOR tenant IN SELECT id FROM organization LOOP
    PERFORM set_config('app.current_org_id', tenant::text, true);
    UPDATE statement_archive
    SET legacy_verification_payload = jsonb_build_object(
      'legacy', true,
      'orgId', org_id,
      'kind', kind,
      'periodLabel', period_label,
      'canonicalPayloadHash', canonical_payload_hash
    )
    WHERE org_id = tenant
      AND canonical_payload IS NULL
      AND legacy_verification_payload IS NULL;
  END LOOP;
  PERFORM set_config('app.current_org_id', '', true);
END;
$$;
ALTER TABLE statement_archive ENABLE TRIGGER statement_archive_no_mutate;
