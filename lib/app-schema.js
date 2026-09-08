const { applyStatements } = require('./apply-statements');

const APP_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vs_uploads (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      title TEXT DEFAULT '',
      expires_at TIMESTAMPTZ,
      password_hash TEXT,
      view_count INTEGER DEFAULT 0,
      file_size BIGINT DEFAULT 0
    )`,
  `CREATE TABLE IF NOT EXISTS vs_upload_chunks (
      video_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (video_id, chunk_index)
    )`,
  `ALTER TABLE vs_upload_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `CREATE INDEX IF NOT EXISTS idx_vs_uploads_expires_at ON vs_uploads(expires_at) WHERE expires_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_vs_uploads_uploaded_at ON vs_uploads(uploaded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_vs_upload_chunks_created_at ON vs_upload_chunks(created_at)`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'upload'`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS embed_video_id TEXT`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS thumbnail_data BYTEA`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS thumbnail_content_type TEXT`,
  `CREATE TABLE IF NOT EXISTS vs_link_thumbnails (
      id TEXT PRIMARY KEY,
      thumbnail_data BYTEA NOT NULL,
      thumbnail_content_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `CREATE INDEX IF NOT EXISTS idx_link_thumbnails_created_at ON vs_link_thumbnails (created_at)`,
  `CREATE TABLE IF NOT EXISTS vs_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `ALTER TABLE vs_users ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS vs_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES vs_users(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_vs_uploads_user_id ON vs_uploads(user_id) WHERE user_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS vs_auth_codes (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `CREATE INDEX IF NOT EXISTS idx_vs_auth_codes_email ON vs_auth_codes(email)`,
  `CREATE INDEX IF NOT EXISTS idx_vs_auth_codes_expires ON vs_auth_codes(expires_at)`,
  `CREATE TABLE IF NOT EXISTS vs_collections (
      slug TEXT PRIMARY KEY,
      user_id TEXT REFERENCES vs_users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  `ALTER TABLE vs_collections ALTER COLUMN user_id DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_vs_collections_user_id ON vs_collections(user_id)`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS collection_id TEXT REFERENCES vs_collections(slug) ON DELETE SET NULL`,
  `ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS collection_order INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_vs_uploads_collection_id ON vs_uploads(collection_id) WHERE collection_id IS NOT NULL`
];

async function applyAppSchema(db) {
  await applyStatements(db, APP_SCHEMA_STATEMENTS);
}

async function migrateLegacyPasswords(db) {
  const colCheck = await db.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vs_users' AND column_name = 'password_hash'
  `);
  if (!colCheck.rows.length) return;
  console.log('Migrating vs_users to magic-code auth: wiping accounts and dropping password_hash');
  await db.query('DELETE FROM vs_users');
  await db.query('ALTER TABLE vs_users DROP COLUMN password_hash');
}

module.exports = { APP_SCHEMA_STATEMENTS, applyAppSchema, migrateLegacyPasswords };
