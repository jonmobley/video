-- Migration script to add multi-page support
-- This script adds page field to support multiple video pages while maintaining backward compatibility

-- Add page column to videos table with default 'oz' for existing records
ALTER TABLE videos ADD COLUMN IF NOT EXISTS page TEXT DEFAULT 'oz';

-- Add page column to categories table with default 'oz' for existing records
ALTER TABLE categories ADD COLUMN IF NOT EXISTS page TEXT DEFAULT 'oz';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_videos_page ON videos(page);
CREATE INDEX IF NOT EXISTS idx_categories_page ON categories(page);

-- Update existing records to explicitly set page to 'oz' (removes dependency on default)
UPDATE videos SET page = 'oz' WHERE page IS NULL;
UPDATE categories SET page = 'oz' WHERE page IS NULL;

-- Create a unique constraint to prevent duplicate video IDs within the same page
-- This allows the same wistia_id to exist on different pages
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_wistia_id_key;
ALTER TABLE videos ADD CONSTRAINT videos_wistia_id_page_unique UNIQUE (wistia_id, page);

-- Update RLS policies to include page filtering (if using RLS)
-- Drop existing policies first
DROP POLICY IF EXISTS "Enable read access for all users" ON videos;
DROP POLICY IF EXISTS "Enable insert for all users" ON videos;
DROP POLICY IF EXISTS "Enable update for all users" ON videos;
DROP POLICY IF EXISTS "Enable delete for all users" ON videos;

DROP POLICY IF EXISTS "Enable read access for all users" ON categories;
DROP POLICY IF EXISTS "Enable insert for all users" ON categories;
DROP POLICY IF EXISTS "Enable update for all users" ON categories;
DROP POLICY IF EXISTS "Enable delete for all users" ON categories;

-- Recreate policies (same permissions, just recreating for clarity)
CREATE POLICY "Enable read access for all users" ON videos
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON videos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON videos
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON videos
    FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON categories
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON categories
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON categories
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON categories
    FOR DELETE USING (true);

-- Add comment to document the schema change
COMMENT ON COLUMN videos.page IS 'Page identifier (e.g., oz, disc) for multi-page support';
COMMENT ON COLUMN categories.page IS 'Page identifier (e.g., oz, disc) for multi-page support';
