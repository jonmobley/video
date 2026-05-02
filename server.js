const express = require('express');
const { Pool, types } = require('pg');
const path = require('path');
const crypto = require('crypto');

// Parse PostgreSQL BIGINT (OID 20) and NUMERIC LENGTH results as JS numbers
// so file_size is returned as a number rather than a string in JSON responses.
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));

const app = express();
const PORT = process.env.PORT || 5000;
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// ── Rate limiting ────────────────────────────────────────────────────────────
const uploadCounts = new Map();
const MAX_UPLOADS_PER_HOUR = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

// Verify-password throttle: prevents brute-forcing protected video passwords
const verifyAttempts = new Map();
const MAX_VERIFY_PER_WINDOW = 8;
const VERIFY_WINDOW_MS = 5 * 60 * 1000;

function checkAndIncrement(map, key, max, windowMs) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  entry.count++;
  map.set(key, entry);
  return entry.count > max;
}

function isRateLimited(ip) {
  return checkAndIncrement(uploadCounts, ip, MAX_UPLOADS_PER_HOUR, RATE_WINDOW_MS);
}

function isVerifyThrottled(key) {
  return checkAndIncrement(verifyAttempts, key, MAX_VERIFY_PER_WINDOW, VERIFY_WINDOW_MS);
}

// Periodic eviction prevents unbounded Map growth from unique IPs
function evictExpiredRateLimits() {
  const now = Date.now();
  for (const [k, v] of uploadCounts) if (now > v.resetAt) uploadCounts.delete(k);
  for (const [k, v] of verifyAttempts) if (now > v.resetAt) verifyAttempts.delete(k);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(pw) {
  return crypto.createHash('sha256').update('vs2026_' + pw).digest('hex');
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function requireAdmin(req, res, next) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not configured' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ── Schema ───────────────────────────────────────────────────────────────────
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vs_uploads (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      title TEXT DEFAULT '',
      expires_at TIMESTAMPTZ,
      password_hash TEXT,
      view_count INTEGER DEFAULT 0,
      file_size BIGINT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS vs_upload_chunks (
      video_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (video_id, chunk_index)
    );
    ALTER TABLE vs_upload_chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_vs_uploads_expires_at ON vs_uploads(expires_at) WHERE expires_at IS NOT NULL;
  `);

  // NOTE: We deliberately do NOT add an FK from vs_upload_chunks → vs_uploads.
  // Upload protocol is "stream chunks, THEN finalize creates the parent row",
  // so a FK would block legal inserts. Orphan chunks (from abandoned uploads)
  // are pruned by cleanupOrphanChunks() below.
}

// ── Cleanup expired videos ───────────────────────────────────────────────────
async function cleanupExpired() {
  try {
    const res = await pool.query(
      'SELECT id FROM vs_uploads WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    );
    for (const { id } of res.rows) {
      await pool.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [id]);
      await pool.query('DELETE FROM vs_uploads WHERE id = $1', [id]);
    }
    if (res.rows.length) console.log(`Cleaned up ${res.rows.length} expired video(s)`);

    // Prune orphan chunks from ABANDONED uploads — chunks older than 6 hours
    // with no matching parent row. The age-gate is critical: in-progress
    // uploads are "orphan" until finalize creates the parent row, so we
    // must not delete recent chunks.
    const orphan = await pool.query(`
      DELETE FROM vs_upload_chunks
      WHERE created_at < NOW() - INTERVAL '6 hours'
        AND video_id NOT IN (SELECT id FROM vs_uploads)
    `);
    if (orphan.rowCount) console.log(`Pruned ${orphan.rowCount} orphan chunk(s)`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Upload chunk ─────────────────────────────────────────────────────────────
app.post('/api/upload-chunk', async (req, res) => {
  try {
    const { videoId, chunkIndex, totalChunks, data, contentType } = req.body;
    if (!videoId || chunkIndex === undefined || !totalChunks || !data || !contentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Rate limit on first chunk only
    if (chunkIndex === 0) {
      const ip = getIp(req);
      if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many uploads. Please try again in an hour.' });
      }
    }

    const buffer = Buffer.from(data, 'base64');
    await pool.query(
      `INSERT INTO vs_upload_chunks (video_id, chunk_index, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (video_id, chunk_index) DO UPDATE SET data = EXCLUDED.data`,
      [videoId, chunkIndex, buffer]
    );

    res.json({ success: true, chunkIndex, totalChunks });
  } catch (err) {
    console.error('upload-chunk error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Finalize video ───────────────────────────────────────────────────────────
app.post('/api/finalize-video', async (req, res) => {
  const { videoId, totalChunks, contentType, title, expiryDays, password } = req.body;
  if (!videoId || !totalChunks || !contentType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    // Validate chunk continuity OUTSIDE the transaction (no locks needed for read).
    // Verify count, min, and max indices are exactly 0..totalChunks-1.
    const continuity = await client.query(
      `SELECT COUNT(*)::int AS cnt,
              MIN(chunk_index)::int AS min_idx,
              MAX(chunk_index)::int AS max_idx
       FROM vs_upload_chunks WHERE video_id = $1`,
      [videoId]
    );
    const { cnt, min_idx, max_idx } = continuity.rows[0];
    if (cnt !== totalChunks || min_idx !== 0 || max_idx !== totalChunks - 1) {
      return res.status(400).json({
        error: `Chunk integrity failure: expected ${totalChunks} contiguous chunks (0..${totalChunks - 1}), got ${cnt} with range ${min_idx}..${max_idx}.`
      });
    }

    const dataResult = await client.query(
      'SELECT data FROM vs_upload_chunks WHERE video_id = $1 ORDER BY chunk_index ASC',
      [videoId]
    );
    const assembled = Buffer.concat(dataResult.rows.map(r => r.data));

    if (assembled.length > MAX_FILE_SIZE) {
      await client.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [videoId]);
      return res.status(400).json({ error: `File too large. Maximum size is ${(MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(0)} GB.` });
    }

    const expiresAt = expiryDays && expiryDays !== 'never'
      ? new Date(Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000)
      : null;
    const passwordHash = password ? hashPassword(password) : null;

    // Atomic finalize: insert metadata, swap chunks → assembled blob, all-or-nothing.
    // ROLLBACK on error keeps state consistent; abandoned chunks (no parent row)
    // are pruned later by the age-gated orphan cleanup in cleanupExpired().
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO vs_uploads (id, content_type, title, expires_at, password_hash, file_size)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           content_type = EXCLUDED.content_type,
           title = EXCLUDED.title,
           expires_at = EXCLUDED.expires_at,
           password_hash = EXCLUDED.password_hash,
           file_size = EXCLUDED.file_size`,
        [videoId, contentType, title || '', expiresAt, passwordHash, assembled.length]
      );
      await client.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [videoId]);
      await client.query(
        'INSERT INTO vs_upload_chunks (video_id, chunk_index, data) VALUES ($1, 0, $2)',
        [videoId, assembled]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    }

    res.json({ success: true, videoUrl: `/api/video/${encodeURIComponent(videoId)}` });
  } catch (err) {
    console.error('finalize-video error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── Video metadata ────────────────────────────────────────────────────────────
app.get('/api/video-meta/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, title, expires_at, password_hash, view_count, file_size, uploaded_at, content_type FROM vs_uploads WHERE id = $1',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });

    const v = result.rows[0];
    if (v.expires_at && new Date(v.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This video has expired.' });
    }

    res.json({
      id: v.id,
      title: v.title || '',
      expiresAt: v.expires_at,
      hasPassword: !!v.password_hash,
      viewCount: v.view_count,
      fileSize: v.file_size,
      uploadedAt: v.uploaded_at,
      contentType: v.content_type
    });
  } catch (err) {
    console.error('video-meta error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Verify password ───────────────────────────────────────────────────────────
app.post('/api/verify-password', async (req, res) => {
  try {
    const { videoId, password } = req.body;
    if (!videoId || !password) return res.status(400).json({ error: 'Missing fields' });

    // Throttle by ip+videoId to slow brute-force on protected videos
    const throttleKey = getIp(req) + '|' + videoId;
    if (isVerifyThrottled(throttleKey)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
    }

    const result = await pool.query(
      'SELECT password_hash FROM vs_uploads WHERE id = $1',
      [videoId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });

    // Constant-time comparison prevents timing-based hash discovery
    const expected = result.rows[0].password_hash || '';
    const provided = hashPassword(password);
    const valid = expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve video (range-request aware) ────────────────────────────────────────
app.get('/api/video/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const metaResult = await pool.query(
      'SELECT content_type, expires_at, password_hash FROM vs_uploads WHERE id = $1',
      [id]
    );
    if (!metaResult.rows.length) return res.status(404).json({ error: 'Video not found' });

    const { content_type, expires_at, password_hash } = metaResult.rows[0];

    if (expires_at && new Date(expires_at) < new Date()) {
      return res.status(410).send('Video expired');
    }

    // Password check via session token in query string
    if (password_hash) {
      const provided = req.query.pt;
      if (!provided || hashPassword(provided) !== password_hash) {
        return res.status(403).json({ error: 'Password required' });
      }
    }

    // Get total size first
    const sizeResult = await pool.query(
      'SELECT LENGTH(data) as size FROM vs_upload_chunks WHERE video_id = $1 AND chunk_index = 0',
      [id]
    );
    if (!sizeResult.rows.length) return res.status(404).json({ error: 'Video data not found' });

    const fileSize = parseInt(sizeResult.rows[0].size);
    const range = req.headers.range;

    // Increment view count (fire and forget)
    pool.query('UPDATE vs_uploads SET view_count = view_count + 1 WHERE id = $1', [id]).catch(() => {});

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
      const chunkLen = end - start + 1;

      // Use PostgreSQL SUBSTRING to read only the needed bytes (1-indexed)
      const dataResult = await pool.query(
        'SELECT SUBSTRING(data FROM $2::int FOR $3::int) as chunk FROM vs_upload_chunks WHERE video_id = $1 AND chunk_index = 0',
        [id, start + 1, chunkLen]
      );

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkLen,
        'Content-Type': content_type,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(dataResult.rows[0].chunk);
    } else {
      const dataResult = await pool.query(
        'SELECT data FROM vs_upload_chunks WHERE video_id = $1 AND chunk_index = 0',
        [id]
      );
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': content_type,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(dataResult.rows[0].data);
    }
  } catch (err) {
    console.error('get-video error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: list videos ────────────────────────────────────────────────────────
app.get('/api/admin/videos', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content_type, uploaded_at, expires_at, view_count, file_size,
              (password_hash IS NOT NULL) as has_password
       FROM vs_uploads ORDER BY uploaded_at DESC`
    );
    res.json({ videos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: delete video ───────────────────────────────────────────────────────
app.delete('/api/admin/video/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [id]);
    await pool.query('DELETE FROM vs_uploads WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clean URL routes ──────────────────────────────────────────────────────────
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'upload.html')));
app.get('/watch', (req, res) => res.sendFile(path.join(__dirname, 'watch.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/oz', (req, res) => res.sendFile(path.join(__dirname, 'oz.html')));
app.get('/disc', (req, res) => res.sendFile(path.join(__dirname, 'disc.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
ensureSchema()
  .then(async () => {
    await cleanupExpired();
    setInterval(cleanupExpired, 60 * 60 * 1000);
    setInterval(evictExpiredRateLimits, 10 * 60 * 1000); // bound rate-limit Map memory
    app.listen(PORT, '0.0.0.0', () => console.log(`VidShare server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
