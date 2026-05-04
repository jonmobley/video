-- Migration: Atomic save procedures for videos and categories
--
-- These stored procedures wrap the delete-then-insert pattern in a single
-- database transaction.  If the INSERT fails (bad data, constraint violation,
-- network timeout) the DELETE is rolled back automatically and the old data
-- remains intact.
--
-- Run this migration against your Supabase database via the SQL Editor or
-- any migration tool you use.

-- ============================================================================
-- replace_page_videos
-- Atomically replace all videos for a given page.
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

-- ============================================================================
-- replace_page_categories
-- Atomically replace scoped categories (songs or tags) for a given page.
--
-- p_show_in_dropdown = TRUE  -> replaces song categories (and legacy NULLs)
-- p_show_in_dropdown = FALSE -> replaces tag categories  (and legacy NULLs)
-- ============================================================================
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
