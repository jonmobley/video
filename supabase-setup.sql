-- Initial database setup for VidShare video management system
-- Author: VidShare Admin System
-- Purpose: Creates the foundational tables and security policies
-- 
-- This script sets up:
-- 1. Videos table for storing video metadata
-- 2. Categories table for organizing videos
-- 3. Automatic timestamp updates
-- 4. Row Level Security policies

-- Create videos table
-- Stores metadata for all videos in the system
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                -- Unique identifier
  wistia_id TEXT NOT NULL UNIQUE,     -- Wistia video platform ID
  title TEXT NOT NULL,                -- Display title for the video
  category TEXT NOT NULL,             -- Primary category reference
  tags TEXT[],                        -- Array of tags for filtering
  url_string TEXT,                    -- URL-friendly string for direct linking
  featured BOOLEAN DEFAULT FALSE,     -- Whether video is featured
  "order" INTEGER DEFAULT 0,          -- Display order within category
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create categories table
-- Stores video categories with visual customization options
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,                -- Category identifier (e.g., 'kids', 'dancers')
  name TEXT NOT NULL,                 -- Display name for the category
  color TEXT,                         -- Hex color for visual styling
  "order" INTEGER DEFAULT 0,          -- Display order in navigation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create updated_at trigger function
-- Automatically updates the updated_at timestamp when a row is modified
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
-- These ensure updated_at is always current when records change
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (optional but recommended)
-- RLS provides fine-grained access control at the database level
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Create policies to allow anonymous access
-- Note: In production, you may want to restrict write operations to authenticated users
-- These policies allow all operations for simplicity

-- Video table policies
CREATE POLICY "Enable read access for all users" ON videos
    FOR SELECT USING (true);  -- Anyone can view videos

CREATE POLICY "Enable insert for all users" ON videos
    FOR INSERT WITH CHECK (true);  -- Anyone can add videos (restrict in production)

CREATE POLICY "Enable update for all users" ON videos
    FOR UPDATE USING (true);  -- Anyone can update videos (restrict in production)

CREATE POLICY "Enable delete for all users" ON videos
    FOR DELETE USING (true);  -- Anyone can delete videos (restrict in production)

-- Category table policies
CREATE POLICY "Enable read access for all users" ON categories
    FOR SELECT USING (true);  -- Anyone can view categories

CREATE POLICY "Enable insert for all users" ON categories
    FOR INSERT WITH CHECK (true);  -- Anyone can add categories (restrict in production)

CREATE POLICY "Enable update for all users" ON categories
    FOR UPDATE USING (true);  -- Anyone can update categories (restrict in production)

CREATE POLICY "Enable delete for all users" ON categories
    FOR DELETE USING (true);  -- Anyone can delete categories (restrict in production)
