const express = require('express');
const { Pool, types } = require('pg');
const path = require('path');
const crypto = require('crypto');

// Parse PostgreSQL BIGINT (OID 20) and NUMERIC LENGTH results as JS numbers
// so file_size is returned as a number rather than a string in JSON responses.
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));

const app = express();
// Replit's edge proxies the app over HTTPS and sets X-Forwarded-For. Trusting
// exactly one hop lets Express derive `req.ip` from the real client IP without
// honouring spoofed headers from arbitrary upstreams.
app.set('trust proxy', 1);
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
  for (const [k, v] of codeRequestByEmail) if (now > v.resetAt) codeRequestByEmail.delete(k);
  for (const [k, v] of codeRequestByIp)    if (now > v.resetAt) codeRequestByIp.delete(k);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(pw) {
  return crypto.createHash('sha256').update('vs2026_' + pw).digest('hex');
}

function getIp(req) {
  // With `trust proxy` set, Express resolves req.ip from the trusted XFF hop;
  // fall back to the raw socket if the proxy didn't set one (e.g. local dev).
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function requireAdmin(req, res, next) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not configured' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ── Magic-code email auth ────────────────────────────────────────────────────
// Codes are 6 digits, sha256-hashed at rest, expire in 10 min, max 5 attempts.
const { getResendClient } = require('./lib/resend-client');
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
// Throttle code requests: max 4 per email per 15min, 10 per IP per 15min.
const codeRequestByEmail = new Map();
const codeRequestByIp = new Map();
const CODE_REQ_WINDOW_MS = 15 * 60 * 1000;
const CODE_REQ_MAX_PER_EMAIL = 4;
const CODE_REQ_MAX_PER_IP = 10;

function generate6DigitCode() {
  // Use rejection sampling on randomInt to avoid modulo bias.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
function hashCode(code) {
  return crypto.createHash('sha256').update('vs_code_v1$' + code).digest('hex');
}

// ── Sessions: signed cookies, no DB row per session ──────────────────────────
// Cookie value is `userId.expMs.hmac` signed with SESSION_SECRET, which is
// generated on first boot and persisted in vs_meta so it survives restarts.
const SESSION_COOKIE = 'vs_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
let SESSION_SECRET = null;

async function loadOrCreateSessionSecret() {
  const existing = await pool.query(`SELECT value FROM vs_meta WHERE key = 'session_secret'`);
  if (existing.rows.length) { SESSION_SECRET = existing.rows[0].value; return; }
  const fresh = crypto.randomBytes(48).toString('hex');
  await pool.query(
    `INSERT INTO vs_meta (key, value) VALUES ('session_secret', $1)
     ON CONFLICT (key) DO NOTHING`,
    [fresh]
  );
  const row = await pool.query(`SELECT value FROM vs_meta WHERE key = 'session_secret'`);
  SESSION_SECRET = row.rows[0].value;
}

function signSession(userId) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, hmac] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`${userId}.${expStr}`).digest('hex');
  const a = Buffer.from(hmac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return userId;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

// Always sets req.userId (may be null). Doesn't block anonymous traffic.
function attachUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.userId = verifySession(cookies[SESSION_COOKIE]);
  next();
}
function requireUser(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Sign in required' });
  next();
}

function setSessionCookie(res, userId) {
  const token = signSession(userId);
  // Secure flag: Replit proxies HTTPS in deployment; harmless on local.
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    'Secure'
  ];
  res.setHeader('Set-Cookie', flags.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
}

// Lightweight email validation — server-side. We're not strict about RFC 5322;
// just enough to catch obvious typos. Real validation = a confirmation email,
// which is out of scope here.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    -- Embed-link videos (YouTube/Vimeo). platform = 'upload' for legacy/native
    -- uploads, 'youtube' or 'vimeo' for pasted links. embed_video_id holds the
    -- platform-specific ID (e.g. YouTube 11-char code, Vimeo numeric ID, or
    -- "NUMERIC/HASH" for unlisted Vimeo videos).
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'upload';
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS embed_video_id TEXT;

    -- User accounts. Auth is magic-code via email (no passwords).
    CREATE TABLE IF NOT EXISTS vs_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS vs_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- Attribute uploads to a user (nullable — anonymous uploads still work).
    -- ON DELETE SET NULL keeps the videos accessible if the account is removed.
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS user_id TEXT
      REFERENCES vs_users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_vs_uploads_user_id ON vs_uploads(user_id) WHERE user_id IS NOT NULL;

    -- Magic-code login table. One active code per (email, code_hash). Old/expired
    -- codes are pruned by cleanupExpired(). attempts caps brute force.
    CREATE TABLE IF NOT EXISTS vs_auth_codes (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vs_auth_codes_email ON vs_auth_codes(email);
    CREATE INDEX IF NOT EXISTS idx_vs_auth_codes_expires ON vs_auth_codes(expires_at);
  `);

  // One-time migration off password auth: drop legacy password_hash column and
  // wipe any pre-existing accounts (per product decision — no migration path).
  // Idempotent: after first run the column is gone and the DELETE is a no-op.
  const colCheck = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vs_users' AND column_name = 'password_hash'
  `);
  if (colCheck.rows.length) {
    console.log('Migrating vs_users to magic-code auth: wiping accounts and dropping password_hash');
    await pool.query('DELETE FROM vs_users');
    await pool.query('ALTER TABLE vs_users DROP COLUMN password_hash');
  }

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

    // Prune used or expired auth codes older than a day — keeps the table tiny.
    const codes = await pool.query(`
      DELETE FROM vs_auth_codes
       WHERE (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 day')
          OR (expires_at < NOW() - INTERVAL '1 day')
    `);
    if (codes.rowCount) console.log(`Pruned ${codes.rowCount} expired auth code(s)`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '8mb' }));
app.use(attachUser);
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
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) {
    return res.status(400).json({ error: 'A title is required.' });
  }
  if (trimmedTitle.length > 120) {
    return res.status(400).json({ error: 'Title must be 120 characters or fewer.' });
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
        `INSERT INTO vs_uploads (id, content_type, title, expires_at, password_hash, file_size, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           content_type = EXCLUDED.content_type,
           title = EXCLUDED.title,
           expires_at = EXCLUDED.expires_at,
           password_hash = EXCLUDED.password_hash,
           file_size = EXCLUDED.file_size,
           user_id = EXCLUDED.user_id`,
        [videoId, contentType, trimmedTitle, expiresAt, passwordHash, assembled.length, req.userId || null]
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

// In-memory cache of oEmbed availability checks. Keyed by `${platform}:${id}`.
// Both YouTube and Vimeo expose a public oEmbed endpoint that returns 200 for
// publicly-embeddable videos and 401/403/404 when the video is private,
// removed, or has embedding disabled by the owner. Checking this server-side
// (rather than trying to attach to the iframe client-side) is the only
// reliable way to detect those states — the iframe itself just renders the
// platform's "video unavailable" UI on success of the page load.
const embedAvailabilityCache = new Map();
const EMBED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function checkEmbedAvailability(platform, embedVideoId) {
  if (!embedVideoId) return true;
  const key = `${platform}:${embedVideoId}`;
  const cached = embedAvailabilityCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.available;

  // Use the most reliable per-platform endpoint:
  //   YouTube: oEmbed returns 200 for public videos, 401 for private,
  //            404 for removed/unknown, and works server-side without auth.
  //   Vimeo:   oEmbed is rate-limited / blocked from many IPs; instead we
  //            hit the player config endpoint that the embed iframe itself
  //            calls — 200 = embeddable, 403 = embedding disabled, 404 = gone.
  let checkUrl;
  if (platform === 'youtube') {
    checkUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + embedVideoId)}&format=json`;
  } else if (platform === 'vimeo') {
    // Unlisted videos use the "ID/HASH" form; player.vimeo.com accepts that
    // path directly without any extra query parameter.
    checkUrl = `https://player.vimeo.com/video/${embedVideoId}/config`;
  } else {
    return true;
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(checkUrl, { signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    const available = r.ok; // 200 = embeddable, 401/403/404 = not embeddable
    embedAvailabilityCache.set(key, { available, expires: Date.now() + EMBED_CACHE_TTL_MS });
    return available;
  } catch {
    // Network failure or timeout: assume available so we don't false-negative
    // a working embed because of a transient outage. The client still has its
    // own safety-net timeout for the truly unreachable case.
    return true;
  }
}

app.get('/api/video-meta/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, title, expires_at, password_hash, view_count, file_size, uploaded_at,
              content_type, platform, embed_video_id
         FROM vs_uploads WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Video not found' });

    const v = result.rows[0];
    if (v.expires_at && new Date(v.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This video has expired.' });
    }

    const platform = v.platform || 'upload';
    let embedAvailable = true;
    if ((platform === 'youtube' || platform === 'vimeo') && v.embed_video_id) {
      embedAvailable = await checkEmbedAvailability(platform, v.embed_video_id);
    }

    res.json({
      id: v.id,
      title: v.title || '',
      expiresAt: v.expires_at,
      hasPassword: !!v.password_hash,
      viewCount: v.view_count,
      fileSize: v.file_size,
      uploadedAt: v.uploaded_at,
      contentType: v.content_type,
      platform,
      embedVideoId: v.embed_video_id || null,
      embedAvailable
    });
  } catch (err) {
    console.error('video-meta error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Create link-based video (YouTube / Vimeo) ────────────────────────────────
// Stores a watch-page record that points at a YouTube or Vimeo embed instead
// of an uploaded blob. Reuses title / expiry / password fields so gating works
// with no behavioural divergence on the watch page.
const linkParser = require('./js/link-parser.js');

app.post('/api/create-link-video', async (req, res) => {
  try {
    const { url, title, expiryDays, password } = req.body || {};

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) return res.status(400).json({ error: 'A title is required.' });
    if (trimmedTitle.length > 120) return res.status(400).json({ error: 'Title must be 120 characters or fewer.' });

    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Please paste a YouTube or Vimeo link.' });
    }
    const parsed = linkParser.parse(url);
    if (!parsed) {
      return res.status(400).json({ error: "That doesn't look like a YouTube or Vimeo link we can embed." });
    }

    // Same per-IP shield as native uploads — these are cheap to create but we
    // still want to cap abuse from a single source.
    const ip = getIp(req);
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many uploads. Please try again in an hour.' });
    }

    const expiresAt = expiryDays && expiryDays !== 'never'
      ? new Date(Date.now() + parseInt(expiryDays, 10) * 24 * 60 * 60 * 1000)
      : null;
    const passwordHash = password ? hashPassword(password) : null;

    // Random opaque ID — no extension, distinct shape from upload IDs to keep
    // the watch URL pattern identical (?id=...) without leaking the platform.
    const videoId = crypto.randomBytes(12).toString('hex');
    const contentType = parsed.platform === 'youtube' ? 'link/youtube' : 'link/vimeo';

    await pool.query(
      `INSERT INTO vs_uploads
         (id, content_type, title, expires_at, password_hash, file_size, user_id, platform, embed_video_id)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
      [videoId, contentType, trimmedTitle, expiresAt, passwordHash, req.userId || null, parsed.platform, parsed.videoId]
    );

    res.json({
      success: true,
      videoId,
      platform: parsed.platform,
      embedVideoId: parsed.videoId,
      watchUrl: `/watch?id=${encodeURIComponent(videoId)}`
    });
  } catch (err) {
    console.error('create-link-video error:', err);
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

// ── Auth: request-code / verify-code / logout / me ───────────────────────────
// Magic-code flow:
//   1. POST /api/auth/request-code { email } → emails a 6-digit code
//   2. POST /api/auth/verify-code  { email, code } → sets session cookie
//      Creates user on first successful verify (signup + login unified).

app.post('/api/auth/request-code', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (email.length > 254)    return res.status(400).json({ error: 'Email is too long.' });

    const ip = getIp(req);
    if (checkAndIncrement(codeRequestByEmail, email, CODE_REQ_MAX_PER_EMAIL, CODE_REQ_WINDOW_MS) ||
        checkAndIncrement(codeRequestByIp,    ip,    CODE_REQ_MAX_PER_IP,    CODE_REQ_WINDOW_MS)) {
      return res.status(429).json({ error: 'Too many code requests. Please wait a few minutes and try again.' });
    }

    const code = generate6DigitCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // Invalidate any previous unused codes for this email so only the latest works.
    await pool.query(
      `UPDATE vs_auth_codes SET used_at = NOW()
        WHERE email = $1 AND used_at IS NULL`,
      [email]
    );
    await pool.query(
      `INSERT INTO vs_auth_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt]
    );

    // Send the email. If Resend fails, surface a generic error and roll back
    // the code so the user can retry without sitting on a dead code.
    try {
      const { client, fromEmail } = await getResendClient();
      const subject = `${code} is your VidShare sign-in code`;
      const text =
        `Your VidShare sign-in code is: ${code}\n\n` +
        `It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
      const html =
        `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0a0a0a;">` +
          `<h2 style="margin:0 0 8px;font-size:20px;">Your VidShare sign-in code</h2>` +
          `<p style="margin:0 0 24px;color:#555;font-size:14px;">Enter this code in the browser to finish signing in. It expires in 10 minutes.</p>` +
          `<div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f5f5f7;padding:16px 24px;border-radius:12px;text-align:center;">${code}</div>` +
          `<p style="margin:24px 0 0;color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>` +
        `</div>`;
      const sendRes = await client.emails.send({ from: fromEmail, to: email, subject, text, html });
      if (sendRes && sendRes.error) throw new Error(sendRes.error.message || 'send failed');
    } catch (mailErr) {
      console.error('request-code email error:', mailErr);
      await pool.query(
        `UPDATE vs_auth_codes SET used_at = NOW()
          WHERE email = $1 AND code_hash = $2 AND used_at IS NULL`,
        [email, codeHash]
      );
      return res.status(502).json({ error: 'Could not send the code email. Please try again in a moment.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('request-code error:', err);
    res.status(500).json({ error: 'Could not send code.' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const code = (req.body.code || '').replace(/\s+/g, '');
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Please enter the 6-digit code from your email.' });

    // Per-IP brute-force shield, separate from the upload-password throttle.
    if (isVerifyThrottled('login:' + getIp(req))) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }

    const codeHash = hashCode(code);
    const lookup = await pool.query(
      `SELECT id, attempts, expires_at, used_at
         FROM vs_auth_codes
        WHERE email = $1
          AND used_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
      [email]
    );
    if (!lookup.rows.length) {
      return res.status(400).json({ error: 'No active code for that email. Please request a new one.' });
    }
    const row = lookup.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'That code has expired. Please request a new one.' });
    }
    if (row.attempts >= CODE_MAX_ATTEMPTS) {
      // Burn the code to force a fresh one.
      await pool.query(`UPDATE vs_auth_codes SET used_at = NOW() WHERE id = $1`, [row.id]);
      return res.status(400).json({ error: 'Too many wrong attempts. Please request a new code.' });
    }

    // Atomic compare: only succeeds if the hash matches AND the row is still
    // unused. Increments attempts unconditionally to guard against guessing.
    const claim = await pool.query(
      `UPDATE vs_auth_codes
          SET used_at = NOW(), attempts = attempts + 1
        WHERE id = $1
          AND code_hash = $2
          AND used_at IS NULL
        RETURNING id`,
      [row.id, codeHash]
    );
    if (!claim.rows.length) {
      await pool.query(`UPDATE vs_auth_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // Find or create the user. Race-safe via ON CONFLICT.
    let userId;
    const existing = await pool.query('SELECT id FROM vs_users WHERE email = $1', [email]);
    if (existing.rows.length) {
      userId = existing.rows[0].id;
    } else {
      userId = crypto.randomBytes(12).toString('hex');
      const ins = await pool.query(
        `INSERT INTO vs_users (id, email) VALUES ($1, $2)
           ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [userId, email]
      );
      userId = ins.rows[0].id;
    }

    setSessionCookie(res, userId);
    res.json({ email });
  } catch (err) {
    console.error('verify-code error:', err);
    res.status(500).json({ error: 'Could not verify code.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not signed in' });
  const result = await pool.query('SELECT email FROM vs_users WHERE id = $1', [req.userId]);
  if (!result.rows.length) { clearSessionCookie(res); return res.status(401).json({ error: 'Not signed in' }); }
  res.json({ email: result.rows[0].email });
});

// ── My videos: list + delete ─────────────────────────────────────────────────
app.get('/api/my-videos', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content_type, uploaded_at, expires_at, view_count, file_size,
              (password_hash IS NOT NULL) AS has_password
       FROM vs_uploads
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
      [req.userId]
    );
    res.json({ videos: result.rows });
  } catch (err) {
    console.error('my-videos list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Claim previously-anonymous uploads from this browser. Only updates rows
// that currently have no owner — never steals from another user. Idempotent.
app.post('/api/my-videos/claim', requireUser, async (req, res) => {
  try {
    const { videoIds } = req.body || {};
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.json({ claimed: 0 });
    }
    // Defensive: cap batch size and keep only string ids.
    const ids = videoIds.filter(v => typeof v === 'string').slice(0, 50);
    if (ids.length === 0) return res.json({ claimed: 0 });

    const result = await pool.query(
      `UPDATE vs_uploads
          SET user_id = $1
        WHERE id = ANY($2::text[])
          AND user_id IS NULL`,
      [req.userId, ids]
    );
    res.json({ claimed: result.rowCount });
  } catch (err) {
    console.error('my-videos claim error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/my-videos/:id', requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    // Ownership check baked into the WHERE — won't touch other users' rows.
    const owned = await pool.query(
      'SELECT 1 FROM vs_uploads WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (!owned.rows.length) return res.status(404).json({ error: 'Video not found' });
    await pool.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [id]);
    await pool.query('DELETE FROM vs_uploads WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('my-videos delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Clean URL routes ──────────────────────────────────────────────────────────
app.get('/upload',  (req, res) => res.sendFile(path.join(__dirname, 'upload.html')));
app.get('/watch',   (req, res) => res.sendFile(path.join(__dirname, 'watch.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login',   (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'account.html')));
app.get('/oz',      (req, res) => res.sendFile(path.join(__dirname, 'oz.html')));
app.get('/disc',    (req, res) => res.sendFile(path.join(__dirname, 'disc.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
ensureSchema()
  .then(async () => {
    await loadOrCreateSessionSecret();
    await cleanupExpired();
    setInterval(cleanupExpired, 60 * 60 * 1000);
    setInterval(evictExpiredRateLimits, 10 * 60 * 1000); // bound rate-limit Map memory
    app.listen(PORT, '0.0.0.0', () => console.log(`VidShare server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
  });
