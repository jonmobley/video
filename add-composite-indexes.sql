-- Migration: Add composite indexes for common query patterns
-- Date: 2026-05-04
--
-- The most common queries filter videos and categories by page and sort by order.
-- Single-column indexes on page and order exist but the planner must combine them.
-- A composite index on (page, "order") lets the database satisfy both the filter
-- and the sort in a single index scan, which scales better as tables grow.

-- Videos: used by get-videos.js  →  .eq('page', page).order('order', { ascending: true })
CREATE INDEX IF NOT EXISTS idx_videos_page_order ON videos(page, "order");

-- Categories: used by get-categories.js  →  .eq('page', page).order('order', { ascending: true })
CREATE INDEX IF NOT EXISTS idx_categories_page_order ON categories(page, "order");
