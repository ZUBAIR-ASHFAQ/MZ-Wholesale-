-- Recreates tenant-role access that pg_dump/pg_restore intentionally omits with --no-acl.
DO $$
DECLARE
  table_name text;
BEGIN
  -- Older backups created before multi-user isolation do not need this role.
  IF to_regprocedure('public.current_tenant_admin_user_id()') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wholesale_erp_tenant') THEN
    CREATE ROLE wholesale_erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;

  EXECUTE format('GRANT wholesale_erp_tenant TO %I', current_user);
  EXECUTE 'GRANT USAGE ON SCHEMA public TO wholesale_erp_tenant';

  FOR table_name IN
    SELECT DISTINCT columns.table_name
    FROM information_schema.columns AS columns
    WHERE columns.table_schema = 'public'
      AND columns.column_name = 'admin_user_id'
      AND columns.table_name <> 'admin_sessions'
    ORDER BY columns.table_name
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO wholesale_erp_tenant',
      table_name
    );
  END LOOP;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_tenant_admin_user_id() TO wholesale_erp_tenant';
END
$$;
