-- Add test YouTube video to DISC page for testing multi-platform support
-- This adds a YouTube video alongside the existing Wistia and Vimeo videos

INSERT INTO videos (id, wistia_id, title, category, tags, url_string, featured, "order", page, video_url, platform) VALUES
('youtube_dQw4w9WgXcQ', 'youtube_dQw4w9WgXcQ', 'Test YouTube Video', 'all', '{test}', 'test-youtube', false, 11, 'disc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube')
ON CONFLICT (wistia_id, page) DO UPDATE SET 
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  url_string = EXCLUDED.url_string,
  "order" = EXCLUDED."order",
  video_url = EXCLUDED.video_url,
  platform = EXCLUDED.platform;
