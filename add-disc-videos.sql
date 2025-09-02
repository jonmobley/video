-- Migration script to add DISC videos (simplified version)
-- Author: VidShare Admin System
-- Purpose: Populates the database with DISC behavioral assessment videos
-- Dependencies: Requires add-page-support.sql to be run first
-- Note: This is a simpler version that puts all videos in one category
--       For categorized version, use add-disc-videos-with-tags.sql instead

-- First, ensure the DISC category exists
-- Creates a single category for all DISC videos
INSERT INTO categories (id, name, color, "order", page) 
VALUES ('disc', 'DISC', '#007AFF', 0, 'disc')  -- Blue color for DISC branding
ON CONFLICT (id) DO UPDATE SET page = 'disc';

-- Insert all DISC videos
-- All videos are placed in the 'disc' category without sub-categorization
INSERT INTO videos (id, wistia_id, title, category, tags, url_string, featured, "order", page) VALUES
('vqb0pfo4zw', 'vqb0pfo4zw', 'Bathroom', 'disc', '{disc}', 'zexm3j', false, 0, 'disc'),
('5vqqwph6wq', '5vqqwph6wq', 'Cookies', 'disc', '{disc}', '4dykji', false, 1, 'disc'),
('nujmnhh6fh', 'nujmnhh6fh', 'DISC FULL Intro', 'disc', '{disc}', '1l49zo', false, 2, 'disc'),
('1t2iqoeme2', '1t2iqoeme2', 'DISC HERO Intro', 'disc', '{disc}', 'kx5ooj', false, 3, 'disc'),
('l6ub2gwc2r', 'l6ub2gwc2r', 'Kitchen Adapt', 'disc', '{disc}', 'tljhw8', false, 4, 'disc'),
('2gexsi52zj', '2gexsi52zj', 'Kitchen', 'disc', '{disc}', '4i9wdx', false, 5, 'disc'),
('1cai4aoxq3', '1cai4aoxq3', 'Returning Home Adapt', 'disc', '{disc}', 'xz3wsu', false, 6, 'disc'),
('3u992i78fk', '3u992i78fk', 'Returning Home', 'disc', '{disc}', 'ls0xk1', false, 7, 'disc'),
('7i7k3gmrzh', '7i7k3gmrzh', 'TV Adapt', 'disc', '{disc}', '679o3x', false, 8, 'disc'),
('5emj65bgp7', '5emj65bgp7', 'TV', 'disc', '{disc}', 'u28f9k', false, 9, 'disc')
ON CONFLICT (wistia_id, page) DO UPDATE SET 
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  url_string = EXCLUDED.url_string,
  "order" = EXCLUDED."order";
