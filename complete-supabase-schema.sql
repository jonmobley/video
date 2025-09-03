-- Complete Supabase Schema for VidShare
-- This file contains all tables and migrations needed for the current version

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================

-- Create videos table if it doesn't exist
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    wistia_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'all',
    tags TEXT[] DEFAULT '{}',
    url_string TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    featured BOOLEAN DEFAULT FALSE,
    "order" INTEGER DEFAULT 0,
    page TEXT DEFAULT 'main',
    video_url TEXT,
    platform TEXT DEFAULT 'wistia',
    UNIQUE(wistia_id, page)
);

-- Add columns if they don't exist (for existing installations)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS page TEXT DEFAULT 'main';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'wistia';

-- Update existing videos to have platform set to 'wistia' if null
UPDATE videos SET platform = 'wistia' WHERE platform IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN videos.video_url IS 'Original video URL from any supported platform';
COMMENT ON COLUMN videos.platform IS 'Video platform: wistia, vimeo, youtube, dropbox, etc.';
COMMENT ON COLUMN videos.featured IS 'Whether this video is featured';
COMMENT ON COLUMN videos."order" IS 'Display order for the video';
COMMENT ON COLUMN videos.page IS 'Which page this video belongs to (main, oz, disc, etc.)';

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    page TEXT DEFAULT 'main',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, page)
);

-- ============================================================================
-- PAGE_CONFIG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_config (
    page TEXT PRIMARY KEY,
    accent_color TEXT DEFAULT '#ff6b6b',
    page_title TEXT,
    meta_description TEXT,
    meta_keywords TEXT,
    canonical_url TEXT,
    og_title TEXT,
    og_description TEXT,
    og_image_url TEXT,
    twitter_title TEXT,
    twitter_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configs for each page
INSERT INTO page_config (page, accent_color) VALUES 
    ('main', '#ff6b6b'),
    ('oz', '#ff6b6b'),
    ('disc', '#ff6b6b')
ON CONFLICT (page) DO NOTHING;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_page ON videos(page);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_featured ON videos(featured);
CREATE INDEX IF NOT EXISTS idx_videos_order ON videos("order");
CREATE INDEX IF NOT EXISTS idx_categories_page ON categories(page);
CREATE INDEX IF NOT EXISTS idx_categories_order ON categories("order");

-- ============================================================================
-- RLS (Row Level Security) - Optional but recommended
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_config ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth setup)
-- Example: Allow public read access
CREATE POLICY "Allow public read access to videos" ON videos
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public read access to categories" ON categories
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public read access to page_config" ON page_config
    FOR SELECT TO anon USING (true);

-- For authenticated users (admin), allow all operations
-- Note: You'll need to set up authentication in Supabase for this to work
CREATE POLICY "Allow authenticated users full access to videos" ON videos
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated users full access to categories" ON categories
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Allow authenticated users full access to page_config" ON page_config
    FOR ALL TO authenticated USING (true);
