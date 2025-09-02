-- Migration script to add meta data fields for page sharing customization
-- This script extends the page_config table to support custom meta tags and social sharing images
-- Author: VidShare Admin System
-- Date: Migration for customizable page meta data and share images
-- Dependencies: Requires add-page-config.sql and add-page-title.sql to be run first

-- Add meta data columns to page_config table
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS meta_keywords TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS og_title TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS og_description TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS og_image_url TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS twitter_title TEXT;
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS twitter_description TEXT;

-- Add canonical URL column for SEO
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Update existing records with sensible defaults based on current page data
UPDATE page_config 
SET 
    meta_description = CASE
        WHEN id = 'oz' THEN 'Watch Grace''s dance videos from Wizard of Oz performances. High-quality dance content featuring choreography, performances, and behind-the-scenes moments.'
        WHEN id = 'disc' THEN 'Explore DISC Heroes video collection. Training videos, performances, and educational content for the DISC community.'
        ELSE COALESCE(page_title, name) || ' - Video Collection'
    END,
    meta_keywords = CASE
        WHEN id = 'oz' THEN 'Grace, Wizard of Oz, dance videos, choreography, performance, theater'
        WHEN id = 'disc' THEN 'DISC, heroes, training videos, educational content, performance'
        ELSE LOWER(COALESCE(page_title, name)) || ', videos, collection'
    END,
    og_title = COALESCE(page_title, name),
    og_description = CASE
        WHEN id = 'oz' THEN 'Watch Grace''s dance videos from Wizard of Oz performances. High-quality dance content featuring choreography, performances, and behind-the-scenes moments.'
        WHEN id = 'disc' THEN 'Explore DISC Heroes video collection. Training videos, performances, and educational content for the DISC community.'
        ELSE COALESCE(page_title, name) || ' - Video Collection'
    END,
    og_image_url = '/assets/og-image.png', -- Default image, can be updated through admin
    canonical_url = CASE
        WHEN id = 'oz' THEN 'https://vidsharepro.netlify.app/oz.html'
        WHEN id = 'disc' THEN 'https://vidsharepro.netlify.app/disc.html'
        ELSE 'https://vidsharepro.netlify.app/' || id || '.html'
    END
WHERE meta_description IS NULL;

-- Add comments to document the new columns
COMMENT ON COLUMN page_config.meta_description IS 'SEO meta description for the page';
COMMENT ON COLUMN page_config.meta_keywords IS 'SEO meta keywords for the page';
COMMENT ON COLUMN page_config.og_title IS 'Open Graph title for social sharing';
COMMENT ON COLUMN page_config.og_description IS 'Open Graph description for social sharing';
COMMENT ON COLUMN page_config.og_image_url IS 'URL or path to the Open Graph image for social sharing';
COMMENT ON COLUMN page_config.twitter_title IS 'Twitter-specific title (optional, falls back to og_title)';
COMMENT ON COLUMN page_config.twitter_description IS 'Twitter-specific description (optional, falls back to og_description)';
COMMENT ON COLUMN page_config.canonical_url IS 'Canonical URL for SEO purposes';

-- Create an index on page_config.id for faster lookups
CREATE INDEX IF NOT EXISTS idx_page_config_id ON page_config(id);
