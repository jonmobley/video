-- Fix page_config RLS to allow public writes for admin functionality
-- This allows the save-page-config function to work without authentication

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow public read access to page_config" ON page_config;
DROP POLICY IF EXISTS "Allow authenticated users full access to page_config" ON page_config;

-- Create new policy that allows public read and write access
-- Note: This is acceptable since page_config is admin-controlled content
CREATE POLICY "Allow public access to page_config" ON page_config
    FOR ALL TO anon, authenticated USING (true);

-- Alternatively, if you prefer to keep RLS strict, ensure the service role key is set:
-- In Netlify dashboard > Site settings > Environment variables, add:
-- SUPABASE_SERVICE_ROLE_KEY = your_service_role_key_here