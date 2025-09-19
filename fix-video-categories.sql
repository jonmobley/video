-- Fix video categories and tags for Oz page
-- This script corrects videos that have 'chorus' or 'dancers' as categories
-- when they should be tags instead

-- Update videos with category 'chorus' to have category 'all-songs' and add 'chorus' to tags
UPDATE videos 
SET 
    category = 'all-songs',
    tags = CASE 
        WHEN 'chorus' = ANY(tags) THEN tags
        ELSE array_append(tags, 'chorus')
    END
WHERE page = 'oz' AND category = 'chorus';

-- Update videos with category 'dancers' to have category 'all-songs' and add 'dancers' to tags  
UPDATE videos 
SET 
    category = 'all-songs',
    tags = CASE 
        WHEN 'dancers' = ANY(tags) THEN tags
        ELSE array_append(tags, 'dancers')
    END
WHERE page = 'oz' AND category = 'dancers';

-- Update any existing videos with category 'all' to use 'all-songs' for consistency
UPDATE videos 
SET category = 'all-songs'
WHERE page = 'oz' AND category = 'all';

-- For Munchkinland videos, set category to 'munchkinland'
UPDATE videos 
SET category = 'munchkinland'
WHERE page = 'oz' 
  AND category = 'all-songs' 
  AND title ILIKE '%munchkinland%';

-- Add 'kids' tag to videos that mention kids in title or tags
UPDATE videos 
SET tags = CASE 
    WHEN 'kids' = ANY(tags) THEN tags
    ELSE array_append(tags, 'kids')
END
WHERE page = 'oz' 
  AND (title ILIKE '%kids%' OR title ILIKE '%children%');

-- Verify the changes
SELECT id, title, category, tags 
FROM videos 
WHERE page = 'oz' 
ORDER BY title;
