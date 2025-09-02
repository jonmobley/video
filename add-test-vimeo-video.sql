-- Add test Vimeo video to DISC page for testing multi-platform support
-- This adds a Vimeo video alongside the existing Wistia videos

INSERT INTO videos (id, wistia_id, title, category, tags, url_string, featured, "order", page, video_url, platform) VALUES
('vimeo_1064681837', 'vimeo_1064681837', 'Test Vimeo Video', 'all', '{test}', 'test-vimeo', false, 10, 'disc', 'https://vimeo.com/1064681837', 'vimeo')
ON CONFLICT (wistia_id, page) DO UPDATE SET 
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  url_string = EXCLUDED.url_string,
  "order" = EXCLUDED."order",
  video_url = EXCLUDED.video_url,
  platform = EXCLUDED.platform;
