-- Migration to add multi-platform video support
-- This adds video_url and platform columns to support Vimeo, YouTube, and other platforms

-- Add video_url column to store the original video URL
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add platform column to identify the video platform
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'wistia';

-- Update existing videos to have the platform set to 'wistia'
UPDATE videos 
SET platform = 'wistia' 
WHERE platform IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN videos.video_url IS 'Original video URL from any supported platform';
COMMENT ON COLUMN videos.platform IS 'Video platform: wistia, vimeo, youtube, dropbox, etc.';
