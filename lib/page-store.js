const { Pool } = require('pg');
const { postgresSslOption } = require('./pg-ssl');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: postgresSslOption(process.env.DATABASE_URL)
    });
  }
  return pool;
}

function query(text, values) {
  return getPool().query(text, values);
}

// Safe to run on every standalone server boot. ALTER statements make this work
// for databases originally created from the old Supabase schema as well.
async function ensurePageSchema(db = getPool()) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY, wistia_id TEXT NOT NULL, title TEXT NOT NULL,
      category TEXT DEFAULT 'all', tags TEXT[] DEFAULT '{}', url_string TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, featured BOOLEAN DEFAULT FALSE,
      "order" INTEGER DEFAULT 0, page TEXT DEFAULT 'main', video_url TEXT,
      platform TEXT DEFAULT 'wistia', thumbnail_url TEXT, UNIQUE(wistia_id, page)
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category_key TEXT NOT NULL,
      color TEXT, icon TEXT, "order" INTEGER DEFAULT 0, page TEXT DEFAULT 'main',
      show_in_dropdown BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_key, page)
    );
    CREATE TABLE IF NOT EXISTS page_config (
      page TEXT PRIMARY KEY, accent_color TEXT DEFAULT '#ff6b6b', page_title TEXT,
      meta_description TEXT, meta_keywords TEXT, canonical_url TEXT, og_title TEXT,
      og_description TEXT, og_image_url TEXT, coming_soon_image_url TEXT,
      twitter_title TEXT, twitter_description TEXT, presentation JSONB NOT NULL DEFAULT '{}'::jsonb,
      editor_token_hash TEXT, setup_token_hash TEXT, setup_token_expires_at TIMESTAMPTZ,
      setup_token_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'wistia';
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS category_key TEXT;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_dropdown BOOLEAN DEFAULT TRUE;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS presentation JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS editor_token_hash TEXT;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS setup_token_hash TEXT;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS setup_token_expires_at TIMESTAMPTZ;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS setup_token_used_at TIMESTAMPTZ;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS og_image_data BYTEA;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS og_image_content_type TEXT;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS coming_soon_image_data BYTEA;
    ALTER TABLE page_config ADD COLUMN IF NOT EXISTS coming_soon_image_content_type TEXT;
    CREATE INDEX IF NOT EXISTS idx_videos_page_order ON videos(page, "order");
    CREATE INDEX IF NOT EXISTS idx_categories_page_order ON categories(page, "order");
  `);
}

module.exports = { getPool, query, ensurePageSchema };