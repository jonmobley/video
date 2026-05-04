-- Lock down page_config RLS: read-only for anonymous, full access for authenticated
-- The save-page-config Netlify function uses the service role key (bypasses RLS)
-- so writes go through without needing a permissive anon policy.

-- Drop the old overly-permissive policy that granted write access to anon
DROP POLICY IF EXISTS "Allow public access to page_config" ON page_config;
DROP POLICY IF EXISTS "Allow public read access to page_config" ON page_config;
DROP POLICY IF EXISTS "Allow authenticated users full access to page_config" ON page_config;

-- Anon users can only SELECT (needed for theming/accent colors on public pages)
CREATE POLICY "Allow public read access to page_config" ON page_config
    FOR SELECT TO anon USING (true);

-- Authenticated Supabase users get full access
CREATE POLICY "Allow authenticated users full access to page_config" ON page_config
    FOR ALL TO authenticated USING (true);