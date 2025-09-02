-- Migration script to add featured video support
-- Author: VidShare Admin System
-- Purpose: Adds a boolean column to mark videos as featured
-- Dependencies: Requires base videos table to exist
--
-- Featured videos can be displayed prominently in the UI
-- Default value is FALSE to maintain backward compatibility

-- Add featured column to existing videos table
ALTER TABLE videos 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Add comment to document the column
COMMENT ON COLUMN videos.featured IS 'Marks a video to be displayed prominently as featured content';
