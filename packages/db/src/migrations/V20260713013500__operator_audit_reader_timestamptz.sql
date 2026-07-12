-- US-022: align the operator reader with the applied audit_log_entry timestamptz columns.
DROP FUNCTION IF EXISTS admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp without time zone,
  timestamp without time zone,
  timestamp without time zone,
  uuid,
  integer
);

CREATE OR REPLACE FUNCTION admin_read_audit_log(
  p_org_id uuid DEFAULT NULL,
  p_actor_kind audit_log_entry_actor_kind_enum DEFAULT NULL,
  p_action_kind text DEFAULT NULL,
  p_from_at timestamp with time zone DEFAULT NULL,
  p_to_at_exclusive timestamp with time zone DEFAULT NULL,
  p_before_at timestamp with time zone DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 51
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  actor_kind audit_log_entry_actor_kind_enum,
  actor_id uuid,
  action_kind text,
  subject_kind text,
  subject_id uuid,
  payload_snapshot jsonb,
  reason text,
  at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF (p_before_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'audit_cursor_incomplete';
  END IF;

  RETURN QUERY
  SELECT
    entry.id,
    entry.org_id,
    entry.actor_kind,
    entry.actor_id,
    entry.action_kind,
    entry.subject_kind,
    entry.subject_id,
    entry.payload_snapshot,
    entry.reason,
    entry.at,
    entry.created_at
  FROM public.audit_log_entry AS entry
  WHERE (p_org_id IS NULL OR entry.org_id = p_org_id)
    AND (p_actor_kind IS NULL OR entry.actor_kind = p_actor_kind)
    AND (p_action_kind IS NULL OR entry.action_kind ILIKE ('%' || p_action_kind || '%'))
    AND (p_from_at IS NULL OR entry.at >= p_from_at)
    AND (p_to_at_exclusive IS NULL OR entry.at < p_to_at_exclusive)
    AND (
      p_before_at IS NULL
      OR (entry.at, entry.id) < (p_before_at, p_before_id)
    )
  ORDER BY entry.at DESC, entry.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 501);
END;
$$;

REVOKE ALL ON FUNCTION admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  uuid,
  integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  uuid,
  integer
) TO CURRENT_USER;

COMMENT ON FUNCTION admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  uuid,
  integer
) IS 'US-022 read-only cross-org audit capability; caller authorization is requirePlatformOperator and FORCE RLS remains enabled.';
