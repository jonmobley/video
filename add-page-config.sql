-- Migration script to add page configuration support
-- This script creates a table to store page-specific configuration including accent colors
-- Author: VidShare Admin System
-- Date: Migration for dynamic page theming and configuration
-- Dependencies: Requires Supabase with RLS enabled

-- Create pages configuration table
-- This table stores configuration for each page in the VidShare system
CREATE TABLE IF NOT EXISTS page_config (
  id TEXT PRIMARY KEY,                    -- Page identifier (e.g., 'oz', 'disc')
  name TEXT NOT NULL,                     -- Short display name for the page
  accent_color TEXT DEFAULT '#008f67',    -- Hex color for page theme (buttons, borders, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Insert default configurations for existing pages
INSERT INTO page_config (id, name, accent_color) VALUES 
  ('oz', 'Wizard of Oz', '#008f67'),
  ('disc', 'DISC', '#4d90db')
ON CONFLICT (id) DO NOTHING;

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_page_config_updated_at BEFORE UPDATE
  ON page_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on page_config table
ALTER TABLE page_config ENABLE ROW LEVEL SECURITY;

-- Create policies for page_config table
CREATE POLICY "Enable read access for all users" ON page_config
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON page_config
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON page_config
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON page_config
    FOR DELETE USING (true);

-- Add comments to document the schema
COMMENT ON TABLE page_config IS 'Stores page-specific configuration including accent colors';
COMMENT ON COLUMN page_config.id IS 'Page identifier (e.g., oz, disc)';
COMMENT ON COLUMN page_config.name IS 'Display name of the page';
COMMENT ON COLUMN page_config.accent_color IS 'Accent color for the page in hex format';
