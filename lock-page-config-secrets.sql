-- Lock down credential columns on page_config and revoke public execute on
-- bulk-replace helpers. Apply on existing databases after deploying the
-- matching application changes.
--
-- Writes continue to go through DATABASE_URL / the service role, which are
-- table owners and are unaffected. Anon and authenticated Supabase roles
-- keep the public presentation columns they need for theming.

REVOKE SELECT ON page_config FROM anon, authenticated, PUBLIC;

GRANT SELECT (
    page,
    accent_color,
    page_title,
    meta_description,
    meta_keywords,
    canonical_url,
    og_title,
    og_description,
    og_image_url,
    coming_soon_image_url,
    twitter_title,
    twitter_description,
    presentation,
    created_at,
    updated_at
) ON page_config TO anon, authenticated;

-- Drop unused Supabase-Auth write policies. This app authenticates writes
-- in Netlify functions / Express, not via Supabase Auth JWTs.
DROP POLICY IF EXISTS "Allow authenticated users full access to page_config" ON page_config;
DROP POLICY IF EXISTS "Allow authenticated users full access to videos" ON videos;
DROP POLICY IF EXISTS "Allow authenticated users full access to categories" ON categories;

REVOKE ALL ON FUNCTION replace_page_videos(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION replace_page_categories(TEXT, JSONB, BOOLEAN) FROM PUBLIC;
