ALTER TYPE year_end_share_out_status_enum ADD VALUE IF NOT EXISTS 'reversed';
ALTER TYPE withdrawal_kind_enum ADD VALUE IF NOT EXISTS 'year_end_reversal';

CREATE TABLE IF NOT EXISTS year_end_share_out_reversal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  year_end_share_out_id uuid NOT NULL REFERENCES year_end_share_out(id),
  reason text NOT NULL,
  reversed_at timestamp NOT NULL,
  reversed_by uuid NOT NULL,
  reversal_payload jsonb NOT NULL,
  created_at timestamp NOT NULL,
  CONSTRAINT uq_year_end_share_out_reversal_org_share_out UNIQUE (org_id, year_end_share_out_id)
);

CREATE INDEX IF NOT EXISTS idx_year_end_share_out_reversal_org_id
  ON year_end_share_out_reversal(org_id);

CREATE INDEX IF NOT EXISTS idx_year_end_share_out_reversal_share_out
  ON year_end_share_out_reversal(year_end_share_out_id);

CREATE TABLE IF NOT EXISTS statement_archive_supersession (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  superseded_statement_archive_id uuid NOT NULL REFERENCES statement_archive(id),
  superseding_statement_archive_id uuid REFERENCES statement_archive(id),
  year_end_share_out_reversal_id uuid NOT NULL REFERENCES year_end_share_out_reversal(id),
  reason text NOT NULL,
  created_at timestamp NOT NULL,
  CONSTRAINT uq_statement_archive_supersession_reversal UNIQUE (
    org_id,
    superseded_statement_archive_id,
    year_end_share_out_reversal_id
  )
);

CREATE INDEX IF NOT EXISTS idx_statement_archive_supersession_org_id
  ON statement_archive_supersession(org_id);

CREATE INDEX IF NOT EXISTS idx_statement_archive_supersession_superseded
  ON statement_archive_supersession(superseded_statement_archive_id);

CREATE INDEX IF NOT EXISTS idx_statement_archive_supersession_reversal
  ON statement_archive_supersession(year_end_share_out_reversal_id);

ALTER TABLE year_end_share_out_reversal ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_end_share_out_reversal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_end_share_out_reversal_tenant_isolation ON year_end_share_out_reversal;
CREATE POLICY year_end_share_out_reversal_tenant_isolation ON year_end_share_out_reversal
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE statement_archive_supersession ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_archive_supersession FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS statement_archive_supersession_tenant_isolation ON statement_archive_supersession;
CREATE POLICY statement_archive_supersession_tenant_isolation ON statement_archive_supersession
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
