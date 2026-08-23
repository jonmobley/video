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
-- Optional thumbnail URL captured from a video frame (e.g. for Dropbox).
-- Falls back to the platform default when null.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

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
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_key TEXT NOT NULL,
    color TEXT,
    "order" INTEGER DEFAULT 0,
    page TEXT DEFAULT 'main',
    show_in_dropdown BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_key, page)
);

-- Add columns if they don't exist (for existing installations)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS category_key TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_dropdown BOOLEAN DEFAULT TRUE;

-- For existing installations, update the id column type if needed
-- Note: This may require manual intervention if there's existing data
-- ALTER TABLE categories ALTER COLUMN id TYPE TEXT;

-- Add comments for documentation
COMMENT ON COLUMN categories.category_key IS 'Original category identifier (e.g., oz, munchkinland, jitterbug, chorus, kids)';
COMMENT ON COLUMN categories.color IS 'Optional hex color for category styling (#RRGGBB)';
COMMENT ON COLUMN categories.id IS 'Composite primary key: page-category_key (e.g., oz-oz, oz-tag-chorus)';
COMMENT ON COLUMN categories.show_in_dropdown IS 'TRUE for song categories (shown in dropdown), FALSE for audience tags (shown as filter pills)';

-- Migration note for existing databases:
-- If you have existing category data, you may need to:
-- 1. Backup your categories table
-- 2. Update existing records to populate category_key and convert id to TEXT
-- 3. Update the UNIQUE constraint if needed

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
    coming_soon_image_url TEXT,
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
-- RATE LIMITS TABLE (used by Netlify serverless upload functions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vs_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION vs_check_rate_limit(
    p_key TEXT,
    p_max_requests INTEGER,
    p_window_minutes INTEGER
) RETURNS TABLE(is_limited BOOLEAN, current_count INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
    v_window_start TIMESTAMPTZ;
    v_window_interval INTERVAL;
BEGIN
    v_window_interval := (p_window_minutes || ' minutes')::INTERVAL;

    INSERT INTO vs_rate_limits (key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (key) DO UPDATE SET
        count = CASE
            WHEN vs_rate_limits.window_start + v_window_interval < now() THEN 1
            ELSE vs_rate_limits.count + 1
        END,
        window_start = CASE
            WHEN vs_rate_limits.window_start + v_window_interval < now() THEN now()
            ELSE vs_rate_limits.window_start
        END
    RETURNING vs_rate_limits.count, vs_rate_limits.window_start
    INTO v_count, v_window_start;

    is_limited := v_count > p_max_requests;
    current_count := v_count;
    IF is_limited THEN
        retry_after_seconds := GREATEST(1,
            EXTRACT(EPOCH FROM (v_window_start + v_window_interval - now()))::INTEGER);
    ELSE
        retry_after_seconds := 0;
    END IF;

    RETURN NEXT;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_vs_rate_limits_window
    ON vs_rate_limits(window_start);

CREATE OR REPLACE FUNCTION vs_cleanup_expired_rate_limits(p_max_age_minutes INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM vs_rate_limits
    WHERE window_start < now() - (p_max_age_minutes || ' minutes')::INTERVAL;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

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

-- Composite indexes for common query patterns (filter by page, sort by order)
CREATE INDEX IF NOT EXISTS idx_videos_page_order ON videos(page, "order");
CREATE INDEX IF NOT EXISTS idx_categories_page_order ON categories(page, "order");

-- ============================================================================
-- RLS (Row Level Security) - Optional but recommended
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_config ENABLE ROW LEVEL SECURITY;

-- Optional artwork used by empty-state page templates.
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS coming_soon_image_url TEXT;

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

-- ============================================================================
-- ATOMIC SAVE PROCEDURES
-- ============================================================================

CREATE OR REPLACE FUNCTION replace_page_videos(p_page TEXT, p_videos JSONB)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('videos:' || p_page));

  DELETE FROM videos WHERE page = p_page;

  INSERT INTO videos (
    id, wistia_id, title, category, tags, url_string,
    "order", page, video_url, platform, thumbnail_url
  )
  SELECT
    v->>'id',
    v->>'wistia_id',
    v->>'title',
    COALESCE(v->>'category', 'all'),
    COALESCE(
      (SELECT array_agg(el) FROM jsonb_array_elements_text(v->'tags') AS el),
      '{}'::TEXT[]
    ),
    v->>'url_string',
    COALESCE((v->>'order')::INTEGER, 0),
    p_page,
    v->>'video_url',
    COALESCE(v->>'platform', 'wistia'),
    v->>'thumbnail_url'
  FROM jsonb_array_elements(COALESCE(p_videos, '[]'::JSONB)) AS v;
END;
$$;

CREATE OR REPLACE FUNCTION replace_page_categories(
  p_page TEXT,
  p_categories JSONB,
  p_show_in_dropdown BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('categories:' || p_page));

  DELETE FROM categories
  WHERE page = p_page
    AND (show_in_dropdown = p_show_in_dropdown OR show_in_dropdown IS NULL);

  INSERT INTO categories (id, name, category_key, color, "order", page, show_in_dropdown)
  SELECT
    v->>'id',
    v->>'name',
    v->>'category_key',
    v->>'color',
    COALESCE((v->>'order')::INTEGER, 0),
    p_page,
    p_show_in_dropdown
  FROM jsonb_array_elements(COALESCE(p_categories, '[]'::JSONB)) AS v;
END;
$$;
