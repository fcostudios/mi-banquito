-- US-022 follow-up: isolate the SECURITY DEFINER audit reader behind one
-- non-login capability role. FORCE RLS remains enabled on audit_log_entry.
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

-- Remove the direct grant left by the original migration. The runtime regains
-- access through capability membership below.
REVOKE ALL ON FUNCTION admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  uuid,
  integer
) FROM CURRENT_USER;

DO $migration$
DECLARE
  capability_ready boolean := false;
  function_signature constant text :=
    'admin_read_audit_log(uuid,audit_log_entry_actor_kind_enum,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,uuid,integer)';
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'mi_banquito_operator_audit') THEN
      CREATE ROLE mi_banquito_operator_audit NOLOGIN;
    END IF;

    ALTER ROLE mi_banquito_operator_audit NOLOGIN;
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || function_signature || ' TO mi_banquito_operator_audit';
    EXECUTE format('GRANT mi_banquito_operator_audit TO %I', current_user);
    capability_ready := true;
  EXCEPTION
    WHEN insufficient_privilege THEN
      capability_ready := false;
  END;

  IF NOT capability_ready THEN
    -- Managed Postgres plans may prohibit CREATE/ALTER/GRANT ROLE. Fail closed
    -- to a named runtime ACL rather than restoring PUBLIC execution.
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO %I',
      function_signature,
      current_user
    );
    RAISE NOTICE 'operator audit capability role unavailable; granted EXECUTE directly to runtime role %', current_user;
  END IF;
END
$migration$;

COMMENT ON FUNCTION admin_read_audit_log(
  uuid,
  audit_log_entry_actor_kind_enum,
  text,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  uuid,
  integer
) IS 'US-022 read-only cross-org audit capability. SQL EXECUTE requires mi_banquito_operator_audit membership (or managed-Postgres runtime ACL fallback); app access also requires requirePlatformOperator; FORCE RLS remains enabled.';
