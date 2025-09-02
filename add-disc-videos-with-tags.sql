-- Migration script to add DISC videos with tags
-- Author: VidShare Admin System
-- Purpose: Populates the database with DISC behavioral assessment videos
-- Dependencies: Requires add-page-support.sql to be run first for multi-page support
-- 
-- This migration:
-- 1. Creates categories specific to DISC page
-- 2. Inserts all DISC videos with appropriate categorization
-- 3. Uses ON CONFLICT to allow re-running without errors

-- First, ensure the DISC categories exist
-- These categories represent different behavioral scenarios and adaptations
INSERT INTO categories (id, name, color, "order", page) VALUES
('all', 'All', '#007AFF', 0, 'disc'),          -- Default category to show all videos
('conflict', 'Conflict', '#FF3B30', 1, 'disc'), -- Red color for conflict scenarios
('adapted', 'Adapted', '#34C759', 2, 'disc')    -- Green color for adapted/resolved scenarios
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  "order" = EXCLUDED."order",
  page = EXCLUDED.page;

-- Insert all DISC videos with appropriate tags
-- Each video represents a workplace scenario showing either conflict or adapted behavior
-- The videos are paired (e.g., "Kitchen" conflict vs "Kitchen Adapt" resolution)
INSERT INTO videos (id, wistia_id, title, category, tags, url_string, featured, "order", page) VALUES
('vqb0pfo4zw', 'vqb0pfo4zw', 'Bathroom', 'conflict', '{conflict}', 'zexm3j', false, 0, 'disc'),
('5vqqwph6wq', '5vqqwph6wq', 'Cookies', 'conflict', '{conflict}', '4dykji', false, 1, 'disc'),
('nujmnhh6fh', 'nujmnhh6fh', 'DISC FULL Intro', 'disc', '{disc}', '1l49zo', false, 2, 'disc'),
('1t2iqoeme2', '1t2iqoeme2', 'DISC HERO Intro', 'disc', '{disc}', 'kx5ooj', false, 3, 'disc'),
('l6ub2gwc2r', 'l6ub2gwc2r', 'Kitchen Adapt', 'adapted', '{adapted}', 'tljhw8', false, 4, 'disc'),
('2gexsi52zj', '2gexsi52zj', 'Kitchen', 'conflict', '{conflict}', '4i9wdx', false, 5, 'disc'),
('1cai4aoxq3', '1cai4aoxq3', 'Returning Home Adapt', 'adapted', '{adapted}', 'xz3wsu', false, 6, 'disc'),
('3u992i78fk', '3u992i78fk', 'Returning Home', 'conflict', '{conflict}', 'ls0xk1', false, 7, 'disc'),
('7i7k3gmrzh', '7i7k3gmrzh', 'TV Adapt', 'adapted', '{adapted}', '679o3x', false, 8, 'disc'),
('5emj65bgp7', '5emj65bgp7', 'TV', 'conflict', '{conflict}', 'u28f9k', false, 9, 'disc')
-- Use ON CONFLICT to handle re-running the migration
-- Updates existing videos if they already exist for this page
ON CONFLICT (wistia_id, page) DO UPDATE SET 
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  url_string = EXCLUDED.url_string,
  "order" = EXCLUDED."order";
