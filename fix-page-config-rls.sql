-- Fix RLS policy for page_config to allow anonymous writes
-- This is needed for the save-page-config function to work

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to page_config" ON page_config;
DROP POLICY IF EXISTS "Allow authenticated users full access to page_config" ON page_config;

-- Create new policies that allow anonymous users to read and write
CREATE POLICY "Allow public read access to page_config" ON page_config
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public write access to page_config" ON page_config
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public update access to page_config" ON page_config
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Keep authenticated user access for admin functions
CREATE POLICY "Allow authenticated users full access to page_config" ON page_config
    FOR ALL TO authenticated USING (true);

-- Update the oz page to have the correct green color
UPDATE page_config SET accent_color = '#008f67' WHERE page = 'oz';
