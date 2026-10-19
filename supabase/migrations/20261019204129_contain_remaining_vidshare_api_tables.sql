DO $containment$
DECLARE
  target text;
  client_role text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('statement_timeout', '15s', true);
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected migration role';
  END IF;
  IF (SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relkind = 'r' AND pg_get_userbyid(relation.relowner) = 'postgres'
      AND relation.relname = ANY (ARRAY['vs_link_thumbnails','vs_upload_chunks','vs_collections','vs_uploads','videos','categories','page_config'])) <> 7 THEN
    RAISE EXCEPTION 'Unexpected target tables or owners';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public') OR
     EXISTS (SELECT 1 FROM pg_attribute attribute JOIN pg_class relation ON relation.oid = attribute.attrelid
             JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
             WHERE namespace.nspname = 'public' AND attribute.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Policy or column grants changed; review before applying';
  END IF;
  LOCK TABLE public.vs_link_thumbnails, public.vs_upload_chunks, public.vs_collections,
    public.vs_uploads, public.videos, public.categories, public.page_config IN ACCESS EXCLUSIVE MODE;
  REVOKE ALL PRIVILEGES ON TABLE public.vs_link_thumbnails, public.vs_upload_chunks,
    public.vs_collections, public.vs_uploads, public.videos, public.categories, public.page_config
    FROM PUBLIC, anon, authenticated;
  FOREACH target IN ARRAY ARRAY['vs_link_thumbnails','vs_upload_chunks','vs_collections','vs_uploads','videos','categories','page_config'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
  END LOOP;
  GRANT SELECT ON TABLE public.videos, public.categories TO anon, authenticated;
  GRANT SELECT (page, accent_color, page_title, meta_description, meta_keywords,
    canonical_url, og_title, og_description, og_image_url, coming_soon_image_url,
    twitter_title, twitter_description, presentation, created_at, updated_at)
    ON public.page_config TO anon, authenticated;
  CREATE POLICY public_gallery_read ON public.videos FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY public_gallery_read ON public.categories FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY public_gallery_read ON public.page_config FOR SELECT TO anon, authenticated USING (true);
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
  FOREACH target IN ARRAY ARRAY['vs_link_thumbnails','vs_upload_chunks','vs_collections','vs_uploads','videos','categories','page_config'] LOOP
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(client_role, format('public.%I', target), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Client mutation privilege remains';
      END IF;
      IF target LIKE 'vs_%' AND has_any_column_privilege(client_role, format('public.%I', target), 'SELECT') THEN
        RAISE EXCEPTION 'Private read privilege remains';
      END IF;
      IF target = 'page_config' AND
         (has_column_privilege(client_role, 'public.page_config', 'editor_token_hash', 'SELECT') OR
          has_column_privilege(client_role, 'public.page_config', 'setup_token_hash', 'SELECT') OR
          has_column_privilege(client_role, 'public.page_config', 'setup_token_expires_at', 'SELECT') OR
          has_column_privilege(client_role, 'public.page_config', 'setup_token_used_at', 'SELECT')) THEN
        RAISE EXCEPTION 'Protected page credential fields remain readable';
      END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', format('public.%I', target), 'SELECT') OR
       NOT has_table_privilege('service_role', format('public.%I', target), 'INSERT') OR
       NOT has_table_privilege('service_role', format('public.%I', target), 'UPDATE') OR
       NOT has_table_privilege('service_role', format('public.%I', target), 'DELETE') THEN
      RAISE EXCEPTION 'Trusted server access changed';
    END IF;
  END LOOP;
END
$containment$;
