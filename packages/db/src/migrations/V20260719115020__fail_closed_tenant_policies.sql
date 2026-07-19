DO $$
DECLARE
  tenant_table RECORD;
  policy_name TEXT;
BEGIN
  FOR tenant_table IN
    SELECT columns.table_schema, columns.table_name
    FROM information_schema.columns columns
    JOIN information_schema.tables tables
      ON tables.table_schema = columns.table_schema
     AND tables.table_name = columns.table_name
    WHERE columns.table_schema = 'public'
      AND columns.column_name = 'org_id'
      AND tables.table_type = 'BASE TABLE'
    ORDER BY columns.table_name
  LOOP
    policy_name := left(tenant_table.table_name || '_tenant_isolation', 63);

    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_name,
      tenant_table.table_schema,
      tenant_table.table_name
    );
    EXECUTE format(
      $policy$
        CREATE POLICY %I ON %I.%I
          USING (
            org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          )
          WITH CHECK (
            org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
          )
      $policy$,
      policy_name,
      tenant_table.table_schema,
      tenant_table.table_name
    );
  END LOOP;
END
$$;
