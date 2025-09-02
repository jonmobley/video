-- Migration script to add page title support
-- This script adds a page_title field to the page_config table for editable page headers
-- Author: VidShare Admin System
-- Date: Migration for editable page titles feature
-- Dependencies: Requires add-page-config.sql to be run first

-- Add page_title column to page_config table
-- This column stores the full display title shown in the page header
ALTER TABLE page_config ADD COLUMN IF NOT EXISTS page_title TEXT;

-- Update existing records with default titles
-- These can be edited by admins through the UI after migration
UPDATE page_config 
SET page_title = CASE
    WHEN id = 'oz' THEN 'Grace Church Wizard of Oz'   -- Default title for Wizard of Oz page
    WHEN id = 'disc' THEN 'DISC Heroes'               -- Default title for DISC page
    ELSE name                                          -- Fallback to name field
END
WHERE page_title IS NULL;

-- Add comment to document the new column
COMMENT ON COLUMN page_config.page_title IS 'Full display title for the page header - editable in admin mode';
