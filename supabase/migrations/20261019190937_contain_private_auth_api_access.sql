DO $containment$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('statement_timeout', '15s', true);

  IF (SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname IN ('vs_meta', 'vs_auth_codes', 'vs_users') AND relation.relkind = 'r' AND pg_get_userbyid(relation.relowner) = 'postgres') <> 3 THEN
    RAISE EXCEPTION 'Unexpected authentication table metadata; containment aborted';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute attribute JOIN pg_class relation ON relation.oid = attribute.attrelid JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname IN ('vs_meta', 'vs_auth_codes', 'vs_users') AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Unexpected column grants; containment aborted';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('vs_meta', 'vs_auth_codes', 'vs_users')) THEN
    RAISE EXCEPTION 'Unexpected authentication policies; containment aborted';
  END IF;

  LOCK TABLE public.vs_auth_codes, public.vs_meta, public.vs_users IN ACCESS EXCLUSIVE MODE;

  REVOKE ALL PRIVILEGES ON TABLE public.vs_meta, public.vs_auth_codes, public.vs_users FROM PUBLIC, anon, authenticated;
  ALTER TABLE public.vs_meta ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.vs_auth_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.vs_users ENABLE ROW LEVEL SECURITY;

  IF EXISTS (SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname IN ('vs_meta', 'vs_auth_codes', 'vs_users') AND (NOT relation.relrowsecurity OR has_table_privilege('anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR NOT has_table_privilege('service_role', relation.oid, 'SELECT') OR NOT has_table_privilege('service_role', relation.oid, 'INSERT') OR NOT has_table_privilege('service_role', relation.oid, 'UPDATE') OR NOT has_table_privilege('service_role', relation.oid, 'DELETE'))) THEN
    RAISE EXCEPTION 'Containment verification failed; changes rolled back';
  END IF;
END
$containment$;
