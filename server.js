const express = require('express');
const { Pool, types } = require('pg');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Optional Supabase client — only initialised if env vars are present.
// Used to best-effort propagate thumbnail URLs to the public `videos`
// table so listings on oz/disc/vertical pick them up. Failures are
// always swallowed: missing config or a failed update must never break
// the primary upload path, which already stored the thumbnail bytes.
let __supabaseClient = null;
function getSupabase() {
  if (__supabaseClient !== null) return __supabaseClient || null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) { __supabaseClient = false; return null; }
  try {
    const { createClient } = require('@supabase/supabase-js');
    __supabaseClient = createClient(url, key);
  } catch (e) {
    console.warn('Supabase client unavailable:', e.message);
    __supabaseClient = false;
  }
  return __supabaseClient || null;
}

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

async function isUserPaid(userId) {
  if (!userId) return false;
  const r = await pool.query('SELECT is_paid FROM vs_users WHERE id = $1', [userId]);
  return r.rows.length > 0 && r.rows[0].is_paid === true;
}

function requireAdmin(req, res, next) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) return apiError(res, 500, 'ADMIN_NOT_CONFIGURED', 'ADMIN_TOKEN not configured on the server.');
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return apiError(res, 401, 'AUTH_REQUIRED', 'Admin token required.');
  // Constant-time compare prevents timing-based token discovery.
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return apiError(res, 403, 'FORBIDDEN', 'Invalid admin token.');
  }
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
  if (!req.userId) return apiError(res, 401, 'AUTH_REQUIRED', 'Please sign in to continue.');
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

// ── Consistent API error shape ───────────────────────────────────────────────
// All non-2xx JSON responses follow `{ error: { code, message } }` so the
// frontend can render a friendly message rather than `[object Object]` or a
// raw stack trace. The `code` is a short machine-readable string the client
// can branch on (e.g. show a retry button for `RATE_LIMITED`).
function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Allowed video content types for native uploads. We're lenient to match what
// browsers actually emit (Safari sends video/quicktime, Chrome sometimes sends
// application/octet-stream for .mkv, etc.) but we still draw a hard line at
// obviously wrong types like text/html.
const ALLOWED_VIDEO_PREFIXES = ['video/', 'application/octet-stream'];
function isAllowedVideoType(ct) {
  if (typeof ct !== 'string' || !ct) return false;
  return ALLOWED_VIDEO_PREFIXES.some(p => ct.toLowerCase().startsWith(p));
}

// Conservative video-id sanity: hex blob optionally followed by a short
// extension. Rejects path traversal attempts (`../`), nulls, and obviously
// malformed ids before they hit any DB query.
const VIDEO_ID_RE = /^[a-f0-9]{12,64}(\.[a-z0-9]{1,8})?$/i;
function isValidVideoId(id) {
  return typeof id === 'string' && id.length <= 80 && VIDEO_ID_RE.test(id);
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
    CREATE INDEX IF NOT EXISTS idx_vs_uploads_uploaded_at ON vs_uploads(uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_vs_upload_chunks_created_at ON vs_upload_chunks(created_at);

    -- Embed-link videos (YouTube/Vimeo/Dailymotion/Loom/Wistia). platform = 'upload' for legacy/native
    -- uploads, 'youtube'/'vimeo'/'dailymotion'/'loom'/'wistia' for pasted links.
    -- embed_video_id holds the platform-specific ID (e.g. YouTube 11-char code,
    -- Vimeo numeric ID, Dailymotion x-prefixed ID, Loom 32-hex-char ID, or
    -- Wistia alphanumeric ID).
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'upload';
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS embed_video_id TEXT;

    -- Captured-frame thumbnails for native uploads (and other non-platform
    -- videos that lack a free, hosted thumbnail like YouTube/Vimeo). Stored
    -- inline in BYTEA — they're small (~30-80 KB JPEG) and live next to the
    -- video bytes which already live in this DB.
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS thumbnail_data BYTEA;
    ALTER TABLE vs_uploads ADD COLUMN IF NOT EXISTS thumbnail_content_type TEXT;

    -- Captured-frame thumbnails for *external link* videos (e.g. Dropbox URLs)
    -- that don't have a row in vs_uploads. Keyed by the client-supplied video
    -- object id (e.g. "wistia_<timestamp>") and served as a stable URL so it
    -- can be persisted into the public Supabase videos table without
    -- bloating it with data: URLs.
    CREATE TABLE IF NOT EXISTS vs_link_thumbnails (
      id TEXT PRIMARY KEY,
      thumbnail_data BYTEA NOT NULL,
      thumbnail_content_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_link_thumbnails_created_at
      ON vs_link_thumbnails (created_at);

    -- User accounts. Auth is magic-code via email (no passwords).
    CREATE TABLE IF NOT EXISTS vs_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE vs_users ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;
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
      `SELECT u.id FROM vs_uploads u
       LEFT JOIN vs_users usr ON u.user_id = usr.id
       WHERE u.expires_at IS NOT NULL AND u.expires_at < NOW()
         AND (u.user_id IS NULL OR usr.is_paid IS NOT TRUE)`
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

    const thumbs = await pool.query(`
      DELETE FROM vs_link_thumbnails
       WHERE created_at < NOW() - INTERVAL '30 days'
    `);
    if (thumbs.rowCount) console.log(`Pruned ${thumbs.rowCount} stale link thumbnail(s)`);
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '8mb' }));
// Catch malformed JSON / oversized payloads from express.json BEFORE they hit
// any route handler — otherwise express's default error renderer dumps an HTML
// stack trace which the frontend can't parse.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return apiError(res, 400, 'BAD_JSON', 'Request body is not valid JSON.');
  }
  if (err && err.type === 'entity.too.large') {
    return apiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (err) {
    console.error('Unhandled middleware error:', err);
    return apiError(res, 500, 'INTERNAL', 'Something went wrong. Please try again.');
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fast.wistia.com https://fast.wistia.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fast.wistia.com https://fast.wistia.net",
    "connect-src 'self' https://*.supabase.co https://*.wistia.com https://*.wistia.net https://embedwistia-a.akamaihd.net https://vimeo.com https://api.qrserver.com",
    "frame-src https://player.vimeo.com https://www.youtube.com https://www.youtube-nocookie.com https://www.dailymotion.com https://geo.dailymotion.com https://www.loom.com https://fast.wistia.com https://fast.wistia.net",
    "media-src 'self' blob: https://*.wistia.com https://*.wistia.net https://embedwistia-a.akamaihd.net",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report"
  ].join('; '));
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.post('/api/csp-report',
  express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'] }),
  (req, res) => {
    const report = req.body && (req.body['csp-report'] || req.body);
    if (report) {
      console.warn('[CSP Violation]', JSON.stringify({
        blockedUri: report['blocked-uri'] || report.blockedURL || 'unknown',
        violatedDirective: report['violated-directive'] || report.effectiveDirective || 'unknown',
        documentUri: report['document-uri'] || report.documentURL || 'unknown',
        sourceFile: report['source-file'] || report.sourceFile || '',
        lineNumber: report['line-number'] || report.lineNumber || '',
        timestamp: new Date().toISOString()
      }));
    }
    res.status(204).end();
  }
);

app.use(attachUser);

// ── Watch page with dynamic OG tags (must be before static middleware) ───────
app.get('/watch', async (req, res) => {
  try {
    const videoId = req.query.id;
    const origin = req.protocol + '://' + req.get('host');
    let ogTags = '';

    if (videoId && isValidVideoId(videoId)) {
      const result = await pool.query(
        `SELECT title, platform, embed_video_id, expires_at,
                (thumbnail_data IS NOT NULL) AS has_thumb
           FROM vs_uploads WHERE id = $1`,
        [videoId]
      );
      if (result.rows.length) {
        const v = result.rows[0];
        const expired = v.expires_at && new Date(v.expires_at) < new Date();
        if (!expired) {
          const title = (v.title || 'Untitled video').replace(/[<>"&]/g, c =>
            ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
          const platform = v.platform || 'upload';

          let imageUrl = `${origin}/assets/vidshare-og.png`;
          if (platform === 'youtube' && v.embed_video_id) {
            imageUrl = `https://img.youtube.com/vi/${encodeURIComponent(v.embed_video_id)}/hqdefault.jpg`;
          } else if (platform === 'vimeo' && v.embed_video_id) {
            imageUrl = `https://vumbnail.com/${encodeURIComponent(v.embed_video_id)}.jpg`;
          } else if (v.has_thumb) {
            imageUrl = `${origin}/api/video-thumbnail/${encodeURIComponent(videoId)}`;
          }

          const watchUrl = `${origin}/watch?id=${encodeURIComponent(videoId)}`;
          ogTags = [
            `<meta property="og:type" content="video.other">`,
            `<meta property="og:url" content="${watchUrl}">`,
            `<meta property="og:title" content="${title} — VidShare">`,
            `<meta property="og:description" content="Watch this video on VidShare">`,
            `<meta property="og:image" content="${imageUrl}">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${title} — VidShare">`,
            `<meta name="twitter:image" content="${imageUrl}">`
          ].join('\n    ');
        }
      }
    }

    if (!ogTags) {
      ogTags = [
        `<meta property="og:type" content="website">`,
        `<meta property="og:title" content="Watch — VidShare">`,
        `<meta property="og:description" content="Watch a video on VidShare">`,
        `<meta property="og:image" content="${origin}/assets/vidshare-og.png">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="Watch — VidShare">`,
        `<meta name="twitter:image" content="${origin}/assets/vidshare-og.png">`
      ].join('\n    ');
    }

    const html = fs.readFileSync(path.join(__dirname, 'watch.html'), 'utf8');
    const injected = html.replace('</head>', `    ${ogTags}\n</head>`);
    res.type('html').send(injected);
  } catch (err) {
    console.error('watch OG injection error:', err);
    res.sendFile(path.join(__dirname, 'watch.html'));
  }
});

app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Upload chunk ─────────────────────────────────────────────────────────────
app.post('/api/upload-chunk', async (req, res) => {
  try {
    const { videoId, chunkIndex, totalChunks, data, contentType } = req.body || {};
    if (!videoId || chunkIndex === undefined || !totalChunks || !data || !contentType) {
      return apiError(res, 400, 'MISSING_FIELDS', 'Missing required fields.');
    }
    if (!isValidVideoId(videoId)) {
      return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100000) {
      return apiError(res, 400, 'BAD_CHUNK_INDEX', 'Invalid chunk index.');
    }
    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 100000) {
      return apiError(res, 400, 'BAD_TOTAL_CHUNKS', 'Invalid total chunks.');
    }
    if (!isAllowedVideoType(contentType)) {
      return apiError(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a video.');
    }
    if (typeof data !== 'string' || data.length === 0) {
      return apiError(res, 400, 'EMPTY_CHUNK', 'Empty chunk data.');
    }

    // Rate limit on first chunk only
    if (chunkIndex === 0) {
      const ip = getIp(req);
      if (isRateLimited(ip)) {
        return apiError(res, 429, 'RATE_LIMITED', 'Too many uploads. Please try again in an hour.');
      }
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      return apiError(res, 400, 'EMPTY_CHUNK', 'Decoded chunk is empty.');
    }
    await pool.query(
      `INSERT INTO vs_upload_chunks (video_id, chunk_index, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (video_id, chunk_index) DO UPDATE SET data = EXCLUDED.data`,
      [videoId, chunkIndex, buffer]
    );

    res.json({ success: true, chunkIndex, totalChunks });
  } catch (err) {
    console.error('upload-chunk error:', err);
    apiError(res, 500, 'INTERNAL', 'Failed to save chunk. Please retry.');
  }
});

// ── Finalize video ───────────────────────────────────────────────────────────
app.post('/api/finalize-video', async (req, res) => {
  const { videoId, totalChunks, contentType, title, expiryDays, password } = req.body || {};
  if (!videoId || !totalChunks || !contentType) {
    return apiError(res, 400, 'MISSING_FIELDS', 'Missing required fields.');
  }
  if (!isValidVideoId(videoId)) {
    return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
  }
  if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > 100000) {
    return apiError(res, 400, 'BAD_TOTAL_CHUNKS', 'Invalid total chunks.');
  }
  if (!isAllowedVideoType(contentType)) {
    return apiError(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported file type. Please upload a video.');
  }
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) {
    return apiError(res, 400, 'TITLE_REQUIRED', 'A title is required.');
  }
  if (trimmedTitle.length > 120) {
    return apiError(res, 400, 'TITLE_TOO_LONG', 'Title must be 120 characters or fewer.');
  }
  if (password != null && typeof password !== 'string') {
    return apiError(res, 400, 'BAD_PASSWORD', 'Invalid password format.');
  }
  if (typeof password === 'string' && password.length > 200) {
    return apiError(res, 400, 'PASSWORD_TOO_LONG', 'Password must be 200 characters or fewer.');
  }
  if (expiryDays != null && expiryDays !== 'never' &&
      !(Number.isInteger(parseInt(expiryDays, 10)) && parseInt(expiryDays, 10) > 0 && parseInt(expiryDays, 10) <= 3650)) {
    return apiError(res, 400, 'BAD_EXPIRY', 'Invalid expiry value.');
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
      return apiError(
        res, 400, 'CHUNK_INTEGRITY',
        `Upload incomplete — some chunks did not arrive. Please retry the upload.`
      );
    }

    const dataResult = await client.query(
      'SELECT data FROM vs_upload_chunks WHERE video_id = $1 ORDER BY chunk_index ASC',
      [videoId]
    );
    const assembled = Buffer.concat(dataResult.rows.map(r => r.data));

    if (assembled.length === 0) {
      await client.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [videoId]);
      return apiError(res, 400, 'EMPTY_FILE', 'The uploaded file is empty (0 bytes).');
    }
    if (assembled.length > MAX_FILE_SIZE) {
      await client.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [videoId]);
      return apiError(
        res, 413, 'FILE_TOO_LARGE',
        `File too large. Maximum size is ${(MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(0)} GB.`
      );
    }

    const paidUser = await isUserPaid(req.userId);
    const expiresAt = (!paidUser && expiryDays && expiryDays !== 'never')
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
    apiError(res, 500, 'INTERNAL', 'Could not finalize the upload. Please try again.');
  } finally {
    client.release();
  }
});

// ── Upload thumbnail ─────────────────────────────────────────────────────────
// Captured client-side from the video file at upload time and POSTed here so
// the dashboard can show a real frame instead of a grey placeholder. Sent as
// a separate request after finalize completes — a thumbnail failure must
// never block the upload itself.
const MAX_THUMB_SIZE = 500 * 1024; // 500 KB decoded
const ALLOWED_THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

app.post('/api/upload-thumbnail', async (req, res) => {
  try {
    const { videoId, data, contentType } = req.body || {};
    if (!videoId || !data || !contentType) {
      return apiError(res, 400, 'MISSING_FIELDS', 'Missing required fields.');
    }
    if (!isValidVideoId(videoId)) {
      return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    if (!ALLOWED_THUMB_TYPES.has(contentType)) {
      return apiError(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported thumbnail type.');
    }
    if (typeof data !== 'string' || data.length === 0) {
      return apiError(res, 400, 'EMPTY_THUMB', 'Thumbnail data is empty.');
    }
    const buf = Buffer.from(data, 'base64');
    if (buf.length === 0) {
      return apiError(res, 400, 'EMPTY_THUMB', 'Thumbnail decoded to 0 bytes.');
    }
    if (buf.length > MAX_THUMB_SIZE) {
      return apiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Thumbnail too large.');
    }

    const owner = await pool.query(
      'SELECT user_id, thumbnail_data FROM vs_uploads WHERE id = $1',
      [videoId]
    );
    if (!owner.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');
    const { user_id, thumbnail_data } = owner.rows[0];
    // Owned video can only get a thumbnail from its owner. Anonymous uploads
    // can be thumbnailed by anyone (the videoId is a 96-bit random secret,
    // so this is effectively a capability token).
    if (user_id && user_id !== req.userId) {
      return apiError(res, 403, 'FORBIDDEN', 'Cannot set thumbnail for this video.');
    }
    // Idempotent on first set; refuse later overwrites to keep this endpoint
    // a one-shot post-upload hook rather than a general edit surface.
    if (thumbnail_data) {
      return apiError(res, 409, 'ALREADY_SET', 'Thumbnail already set.');
    }

    await pool.query(
      'UPDATE vs_uploads SET thumbnail_data = $2, thumbnail_content_type = $3 WHERE id = $1',
      [videoId, buf, contentType]
    );

    // Best-effort: surface the thumbnail URL on any matching public
    // `videos` row so listings powered by get-videos pick it up. Errors
    // here are non-fatal — the bytes are already stored above.
    const thumbnailUrl = `/api/video-thumbnail/${videoId}`;
    const supa = getSupabase();
    if (supa) {
      try {
        await supa.from('videos').update({ thumbnail_url: thumbnailUrl }).eq('id', videoId);
      } catch (e) {
        console.warn('Supabase thumbnail_url update failed:', e.message);
      }
    }

    res.json({ success: true, thumbnailUrl });
  } catch (err) {
    console.error('upload-thumbnail error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not save thumbnail.');
  }
});

// ── Replace thumbnail (owner-only) ───────────────────────────────────────────
// Lets a signed-in user pick a different captured frame or upload a custom
// image as the thumbnail for one of their own videos. Unlike the one-shot
// /api/upload-thumbnail above, this endpoint deliberately overwrites an
// existing thumbnail so users can fix awkward auto-captured frames from the
// dashboard. Owner check is enforced by the WHERE clause.
app.post('/api/my-videos/:id/thumbnail', requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) {
      return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    const { data, contentType } = req.body || {};
    if (!data || !contentType) {
      return apiError(res, 400, 'MISSING_FIELDS', 'Missing required fields.');
    }
    if (!ALLOWED_THUMB_TYPES.has(contentType)) {
      return apiError(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported thumbnail type. Use JPEG, PNG, or WebP.');
    }
    if (typeof data !== 'string' || data.length === 0) {
      return apiError(res, 400, 'EMPTY_THUMB', 'Thumbnail data is empty.');
    }
    let buf;
    try { buf = Buffer.from(data, 'base64'); }
    catch { return apiError(res, 400, 'BAD_BASE64', 'Thumbnail data is not valid base64.'); }
    if (buf.length === 0) {
      return apiError(res, 400, 'EMPTY_THUMB', 'Thumbnail decoded to 0 bytes.');
    }
    if (buf.length > MAX_THUMB_SIZE) {
      return apiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Thumbnail too large. Max 500 KB.');
    }

    // Ownership check baked into the UPDATE — won't touch other users' rows.
    const result = await pool.query(
      `UPDATE vs_uploads
          SET thumbnail_data = $2, thumbnail_content_type = $3
        WHERE id = $1 AND user_id = $4
        RETURNING id`,
      [id, buf, contentType, req.userId]
    );
    if (!result.rows.length) {
      return apiError(res, 404, 'NOT_FOUND', 'Video not found.');
    }

    // Best-effort: keep the public Supabase row's thumbnail_url in sync so
    // any external listings refresh too. The path itself is stable; the
    // browser cache-busts via the version param it appends.
    const thumbnailUrl = `/api/video-thumbnail/${id}`;
    const supa = getSupabase();
    if (supa) {
      try {
        await supa.from('videos').update({ thumbnail_url: thumbnailUrl }).eq('id', id);
      } catch (e) {
        console.warn('Supabase thumbnail_url update failed:', e.message);
      }
    }

    res.json({ success: true, thumbnailUrl, version: Date.now() });
  } catch (err) {
    console.error('replace-thumbnail error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not save thumbnail.');
  }
});

// ── Link-thumbnail (external videos) ─────────────────────────────────────────
// Stores captured frames for non-vs_uploads videos (e.g. Dropbox URL flow).
// Keyed by the client-supplied id; served at a stable URL so it can be
// written into the Supabase `videos.thumbnail_url` column without embedding
// a multi-hundred-KB data: URL inline.
const LINK_THUMB_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

app.post('/api/upload-link-thumbnail', async (req, res) => {
  try {
    const { id, data, contentType } = req.body || {};
    if (!id || !data || !contentType) {
      return apiError(res, 400, 'MISSING_FIELDS', 'Missing required fields.');
    }
    if (typeof id !== 'string' || !LINK_THUMB_ID_RE.test(id)) {
      return apiError(res, 400, 'BAD_ID', 'Invalid thumbnail id.');
    }
    if (!ALLOWED_THUMB_TYPES.has(contentType)) {
      return apiError(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported thumbnail type.');
    }
    let buf;
    try { buf = Buffer.from(data, 'base64'); }
    catch { return apiError(res, 400, 'BAD_BASE64', 'Thumbnail data is not valid base64.'); }
    if (buf.length === 0) {
      return apiError(res, 400, 'EMPTY_THUMB', 'Thumbnail decoded to 0 bytes.');
    }
    if (buf.length > MAX_THUMB_SIZE) {
      return apiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Thumbnail too large.');
    }

    // Idempotent insert. ON CONFLICT DO NOTHING so a retry from the client
    // doesn't clobber an earlier capture; clients only call this once per id.
    await pool.query(
      `INSERT INTO vs_link_thumbnails (id, thumbnail_data, thumbnail_content_type)
       VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, buf, contentType]
    );

    res.json({ success: true, thumbnailUrl: `/api/link-thumbnail/${encodeURIComponent(id)}` });
  } catch (err) {
    console.error('upload-link-thumbnail error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not save thumbnail.');
  }
});

app.get('/api/link-thumbnail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!LINK_THUMB_ID_RE.test(id)) {
      return apiError(res, 400, 'BAD_ID', 'Invalid thumbnail id.');
    }
    const row = await pool.query(
      'SELECT thumbnail_data, thumbnail_content_type FROM vs_link_thumbnails WHERE id = $1',
      [id]
    );
    if (!row.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Thumbnail not found.');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', row.rows[0].thumbnail_content_type || 'image/jpeg');
    res.send(row.rows[0].thumbnail_data);
  } catch (err) {
    console.error('link-thumbnail GET error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not load thumbnail.');
  }
});

app.get('/api/video-thumbnail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    const result = await pool.query(
      'SELECT thumbnail_data, thumbnail_content_type FROM vs_uploads WHERE id = $1',
      [id]
    );
    if (!result.rows.length || !result.rows[0].thumbnail_data) {
      return apiError(res, 404, 'NOT_FOUND', 'Thumbnail not found.');
    }
    const { thumbnail_data, thumbnail_content_type } = result.rows[0];
    res.writeHead(200, {
      'Content-Type': thumbnail_content_type || 'image/jpeg',
      'Content-Length': thumbnail_data.length,
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(thumbnail_data);
  } catch (err) {
    console.error('video-thumbnail error:', err);
    if (!res.headersSent) apiError(res, 500, 'INTERNAL', 'Could not load thumbnail.');
  }
});

// ── Video metadata ────────────────────────────────────────────────────────────

// In-memory cache of oEmbed availability checks. Keyed by `${platform}:${id}`.
// All five supported platforms expose a lightweight endpoint that returns 200
// for publicly-embeddable videos and 401/403/404 when the video is private,
// removed, or has embedding disabled by the owner. Checking this server-side
// (rather than trying to attach to the iframe client-side) is the only
// reliable way to detect those states — the iframe itself just renders the
// platform's "video unavailable" UI on success of the page load.
//   YouTube:      oEmbed (200 public, 401 private, 404 removed)
//   Vimeo:        player config endpoint (200 embeddable, 403/404 not)
//   Dailymotion:  oEmbed (200 public, 404 private/removed)
//   Loom:         HEAD on share URL (200 public, 404 private/removed)
//   Wistia:       oEmbed (200 public, 404 private/removed)
const embedAvailabilityCache = new Map();
const EMBED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function checkEmbedAvailability(platform, embedVideoId, { throwOnError = false } = {}) {
  if (!embedVideoId) return true;
  const key = `${platform}:${embedVideoId}`;
  const cached = embedAvailabilityCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.available;

  // Use the most reliable per-platform endpoint (see comment block above).
  let checkUrl;
  let checkMethod = 'GET';
  if (platform === 'youtube') {
    checkUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + embedVideoId)}&format=json`;
  } else if (platform === 'vimeo') {
    checkUrl = `https://player.vimeo.com/video/${embedVideoId}/config`;
  } else if (platform === 'dailymotion') {
    checkUrl = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent('https://www.dailymotion.com/video/' + embedVideoId)}&format=json`;
  } else if (platform === 'loom') {
    checkUrl = `https://www.loom.com/share/${embedVideoId}`;
    checkMethod = 'HEAD';
  } else if (platform === 'wistia') {
    checkUrl = `https://fast.wistia.com/oembed?url=${encodeURIComponent('https://fast.wistia.com/medias/' + embedVideoId)}&format=json`;
  } else {
    return true;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    let r = await fetch(checkUrl, { method: checkMethod, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok && r.status === 405 && checkMethod === 'HEAD') {
      r = await fetch(checkUrl, { method: 'GET', signal: ctrl.signal, redirect: 'follow' });
    }
    const available = r.ok; // 200 = embeddable, 401/403/404 = not embeddable
    embedAvailabilityCache.set(key, { available, expires: Date.now() + EMBED_CACHE_TTL_MS });
    return available;
  } catch (e) {
    // Network failure or timeout: assume available so we don't false-negative
    // a working embed because of a transient outage. The client still has its
    // own safety-net timeout for the truly unreachable case.
    // When throwOnError is set, callers can distinguish "confirmed available"
    // from "check failed" and surface a non-blocking note.
    if (throwOnError) throw e;
    return true;
  } finally {
    clearTimeout(t);
  }
}

app.get('/api/video-meta/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    const result = await pool.query(
      `SELECT id, title, expires_at, password_hash, view_count, file_size, uploaded_at,
              content_type, platform, embed_video_id
         FROM vs_uploads WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');

    const v = result.rows[0];
    if (v.expires_at && new Date(v.expires_at) < new Date()) {
      return apiError(res, 410, 'EXPIRED', 'This video has expired.');
    }

    const platform = v.platform || 'upload';
    let embedAvailable = true;
    if (v.embed_video_id && (platform === 'youtube' || platform === 'vimeo' ||
        platform === 'dailymotion' || platform === 'loom' || platform === 'wistia')) {
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
    apiError(res, 500, 'INTERNAL', 'Could not load video info.');
  }
});

// ── Create link-based video (YouTube / Vimeo / Dailymotion / Loom / Wistia) ──
// Stores a watch-page record that points at a platform embed instead of an
// uploaded blob. Reuses title / expiry / password fields so gating works with
// no behavioural divergence on the watch page.
const linkParser = require('./js/link-parser.js');

app.post('/api/create-link-video', async (req, res) => {
  try {
    const { url, title, expiryDays, password } = req.body || {};

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) return apiError(res, 400, 'TITLE_REQUIRED', 'A title is required.');
    if (trimmedTitle.length > 120) return apiError(res, 400, 'TITLE_TOO_LONG', 'Title must be 120 characters or fewer.');

    if (typeof url !== 'string' || !url.trim()) {
      return apiError(res, 400, 'URL_REQUIRED', 'Please paste a video link (YouTube, Vimeo, Dailymotion, Loom, or Wistia).');
    }
    if (url.length > 2048) {
      return apiError(res, 400, 'URL_TOO_LONG', 'That URL is too long.');
    }
    // Reject obvious non-embeddable hosts up front with a clear message so the
    // user isn't left wondering why a "link" got rejected as un-parseable.
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('dropbox.com') || lowerUrl.includes('drive.google.com') ||
        lowerUrl.includes('onedrive.live.com') || lowerUrl.includes('icloud.com')) {
      return apiError(res, 400, 'UNSUPPORTED_HOST',
        'Dropbox/Drive links aren\u2019t supported. Upload the file directly, or paste a YouTube, Vimeo, Dailymotion, Loom, or Wistia link.');
    }
    const parsed = linkParser.parse(url);
    if (!parsed) {
      return apiError(res, 400, 'BAD_LINK', "That doesn't look like a supported video link we can embed.");
    }
    const MAX_YT_ID_LEN = 16;
    const MAX_VIMEO_DIGITS = 15;
    if (parsed.platform === 'youtube' && parsed.videoId.length > MAX_YT_ID_LEN) {
      return apiError(res, 400, 'BAD_VIDEO_ID', 'That YouTube video ID looks too long to be valid.');
    }
    if (parsed.platform === 'vimeo') {
      const numericPart = parsed.videoId.split('/')[0];
      if (numericPart.length > MAX_VIMEO_DIGITS) {
        return apiError(res, 400, 'BAD_VIDEO_ID', 'That Vimeo video ID looks too long to be valid.');
      }
    }
    if (password != null && typeof password !== 'string') {
      return apiError(res, 400, 'BAD_PASSWORD', 'Invalid password format.');
    }
    if (typeof password === 'string' && password.length > 200) {
      return apiError(res, 400, 'PASSWORD_TOO_LONG', 'Password must be 200 characters or fewer.');
    }
    if (expiryDays != null && expiryDays !== 'never' &&
        !(Number.isInteger(parseInt(expiryDays, 10)) && parseInt(expiryDays, 10) > 0 && parseInt(expiryDays, 10) <= 3650)) {
      return apiError(res, 400, 'BAD_EXPIRY', 'Invalid expiry value.');
    }

    // Same per-IP shield as native uploads — these are cheap to create but we
    // still want to cap abuse from a single source.
    const ip = getIp(req);
    if (isRateLimited(ip)) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many uploads. Please try again in an hour.');
    }

    let embedCheckUncertain = false;
    try {
      const embedAvailable = await checkEmbedAvailability(parsed.platform, parsed.videoId, { throwOnError: true });
      if (!embedAvailable) {
        const platformMessages = {
          youtube: 'This video appears to be private or unavailable. Check its privacy settings on YouTube and try again.',
          vimeo: 'This video appears to be private or unavailable. Make sure embedding is enabled on Vimeo and try again.',
          dailymotion: 'This video appears to be private or unavailable. Check its settings on Dailymotion and try again.',
          loom: 'This video appears to be private or unavailable. Check its sharing settings on Loom and try again.',
          wistia: 'This video appears to be private or unavailable. Check its sharing settings on Wistia and try again.'
        };
        const msg = platformMessages[parsed.platform] || 'This video appears to be private or unavailable.';
        return apiError(res, 422, 'VIDEO_UNAVAILABLE', msg);
      }
    } catch {
      embedCheckUncertain = true;
    }

    const paidUser = await isUserPaid(req.userId);
    const expiresAt = (!paidUser && expiryDays && expiryDays !== 'never')
      ? new Date(Date.now() + parseInt(expiryDays, 10) * 24 * 60 * 60 * 1000)
      : null;
    const passwordHash = password ? hashPassword(password) : null;

    // Random opaque ID — no extension, distinct shape from upload IDs to keep
    // the watch URL pattern identical (?id=...) without leaking the platform.
    const videoId = crypto.randomBytes(12).toString('hex');
    const contentType = `link/${parsed.platform}`;

    await pool.query(
      `INSERT INTO vs_uploads
         (id, content_type, title, expires_at, password_hash, file_size, user_id, platform, embed_video_id)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
      [videoId, contentType, trimmedTitle, expiresAt, passwordHash, req.userId || null, parsed.platform, parsed.videoId]
    );

    const response = {
      success: true,
      videoId,
      platform: parsed.platform,
      embedVideoId: parsed.videoId,
      watchUrl: `/watch?id=${encodeURIComponent(videoId)}`
    };
    if (embedCheckUncertain) {
      response.warning = 'We couldn\u2019t verify whether this video is publicly embeddable right now. It has been saved, but double-check that the video\u2019s sharing settings allow embedding.';
    }
    res.json(response);
  } catch (err) {
    console.error('create-link-video error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not create the link. Please try again.');
  }
});

// ── Verify password ───────────────────────────────────────────────────────────
app.post('/api/verify-password', async (req, res) => {
  try {
    const { videoId, password } = req.body || {};
    if (!videoId || !password) return apiError(res, 400, 'MISSING_FIELDS', 'Missing fields.');
    if (typeof videoId !== 'string' || !isValidVideoId(videoId)) {
      return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    if (typeof password !== 'string' || password.length > 200) {
      return apiError(res, 400, 'BAD_PASSWORD', 'Invalid password.');
    }

    // Throttle by ip+videoId to slow brute-force on protected videos
    const throttleKey = getIp(req) + '|' + videoId;
    if (isVerifyThrottled(throttleKey)) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes.');
    }

    const result = await pool.query(
      'SELECT password_hash FROM vs_uploads WHERE id = $1',
      [videoId]
    );
    if (!result.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');

    // Constant-time comparison prevents timing-based hash discovery
    const expected = result.rows[0].password_hash || '';
    const provided = hashPassword(password);
    const valid = expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    res.json({ valid });
  } catch (err) {
    console.error('verify-password error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not verify password.');
  }
});

// ── Serve video (range-request aware) ────────────────────────────────────────
app.get('/api/video/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');

    const metaResult = await pool.query(
      'SELECT content_type, expires_at, password_hash FROM vs_uploads WHERE id = $1',
      [id]
    );
    if (!metaResult.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');

    const { content_type, expires_at, password_hash } = metaResult.rows[0];

    if (expires_at && new Date(expires_at) < new Date()) {
      return apiError(res, 410, 'EXPIRED', 'This video has expired.');
    }

    // Password check via session token in query string
    if (password_hash) {
      const provided = req.query.pt;
      if (!provided || hashPassword(provided) !== password_hash) {
        return apiError(res, 403, 'PASSWORD_REQUIRED', 'Password required.');
      }
    }

    // Get total size first
    const sizeResult = await pool.query(
      'SELECT LENGTH(data) as size FROM vs_upload_chunks WHERE video_id = $1 AND chunk_index = 0',
      [id]
    );
    if (!sizeResult.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video data not found.');

    const fileSize = parseInt(sizeResult.rows[0].size);
    const range = req.headers.range;

    // Increment view count (fire and forget). Skip when the owner is the
    // one fetching — e.g. the dashboard's thumbnail picker loads the video
    // to extract candidate frames and shouldn't inflate their stats.
    const ownerOnly = await pool.query('SELECT user_id FROM vs_uploads WHERE id = $1', [id]);
    const isOwner = ownerOnly.rows.length && ownerOnly.rows[0].user_id && ownerOnly.rows[0].user_id === req.userId;
    if (!isOwner) {
      pool.query('UPDATE vs_uploads SET view_count = view_count + 1 WHERE id = $1', [id]).catch(() => {});
    }

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
    if (!res.headersSent) apiError(res, 500, 'INTERNAL', 'Could not stream the video.');
  }
});

// ── Admin: list videos ────────────────────────────────────────────────────────
app.get('/api/admin/videos', requireAdmin, async (req, res) => {
  try {
    const limit  = Math.max(1, Math.min(200, parseInt(req.query.limit,  10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim().toLowerCase();
    const platform = (req.query.platform || '').trim().toLowerCase();

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`u.title ILIKE $${paramIdx}`);
      params.push('%' + search + '%');
      paramIdx++;
    }
    if (status === 'expired') {
      conditions.push(`u.expires_at IS NOT NULL AND u.expires_at < NOW()`);
    } else if (status === 'password') {
      conditions.push(`u.password_hash IS NOT NULL`);
    } else if (status === 'active') {
      conditions.push(`(u.expires_at IS NULL OR u.expires_at >= NOW())`);
      conditions.push(`u.password_hash IS NULL`);
    }
    if (['upload', 'youtube', 'vimeo'].includes(platform)) {
      conditions.push(`u.platform = $${paramIdx}`);
      params.push(platform);
      paramIdx++;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM vs_uploads u ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    const totalUnfilteredResult = await pool.query('SELECT COUNT(*)::int AS total FROM vs_uploads');
    const totalUnfiltered = totalUnfilteredResult.rows[0].total;

    const limitParam = paramIdx++;
    const offsetParam = paramIdx++;
    const result = await pool.query(
      `SELECT u.id, u.title, u.content_type, u.uploaded_at, u.expires_at,
              u.view_count, u.file_size, u.platform,
              (u.password_hash IS NOT NULL) as has_password,
              COALESCE(usr.is_paid, FALSE) as owner_is_paid
       FROM vs_uploads u
       LEFT JOIN vs_users usr ON u.user_id = usr.id
       ${whereClause}
       ORDER BY u.uploaded_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    const statsResult = await pool.query(
      `SELECT COALESCE(SUM(file_size),0)::bigint AS total_size,
              COALESCE(SUM(view_count),0)::int AS total_views,
              COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW())::int AS expired_count
       FROM vs_uploads`
    );
    const stats = statsResult.rows[0];

    res.json({
      videos: result.rows,
      total,
      total_unfiltered: totalUnfiltered,
      limit,
      offset,
      total_size: Number(stats.total_size),
      total_views: stats.total_views,
      expired_count: stats.expired_count
    });
  } catch (err) {
    console.error('admin list error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not load videos.');
  }
});

// ── Admin: delete video ───────────────────────────────────────────────────────
app.delete('/api/admin/video/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    await pool.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [id]);
    await pool.query('DELETE FROM vs_uploads WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('admin delete error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not delete the video.');
  }
});

// ── Auth: request-code / verify-code / logout / me ───────────────────────────
// Magic-code flow:
//   1. POST /api/auth/request-code { email } → emails a 6-digit code
//   2. POST /api/auth/verify-code  { email, code } → sets session cookie
//      Creates user on first successful verify (signup + login unified).

app.post('/api/auth/request-code', async (req, res) => {
  try {
    const rawEmail = (req.body && req.body.email);
    if (typeof rawEmail !== 'string') return apiError(res, 400, 'BAD_EMAIL', 'Please enter a valid email.');
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return apiError(res, 400, 'BAD_EMAIL', 'Please enter a valid email.');
    if (email.length > 254)    return apiError(res, 400, 'EMAIL_TOO_LONG', 'Email is too long.');

    const ip = getIp(req);
    if (checkAndIncrement(codeRequestByEmail, email, CODE_REQ_MAX_PER_EMAIL, CODE_REQ_WINDOW_MS) ||
        checkAndIncrement(codeRequestByIp,    ip,    CODE_REQ_MAX_PER_IP,    CODE_REQ_WINDOW_MS)) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many code requests. Please wait a few minutes and try again.');
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
      return apiError(res, 502, 'EMAIL_SEND_FAILED', 'Could not send the code email. Please try again in a moment.');
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('request-code error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not send code.');
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const rawEmail = req.body && req.body.email;
    const rawCode = req.body && req.body.code;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const code = typeof rawCode === 'string' ? rawCode.replace(/\s+/g, '') : '';
    if (!EMAIL_RE.test(email)) return apiError(res, 400, 'BAD_EMAIL', 'Please enter a valid email.');
    if (!/^\d{6}$/.test(code)) return apiError(res, 400, 'BAD_CODE', 'Please enter the 6-digit code from your email.');

    // Per-IP brute-force shield, separate from the upload-password throttle.
    if (isVerifyThrottled('login:' + getIp(req))) {
      return apiError(res, 429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
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
      return apiError(res, 400, 'NO_CODE', 'No active code for that email. Please request a new one.');
    }
    const row = lookup.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return apiError(res, 400, 'CODE_EXPIRED', 'That code has expired. Please request a new one.');
    }
    if (row.attempts >= CODE_MAX_ATTEMPTS) {
      // Burn the code to force a fresh one.
      await pool.query(`UPDATE vs_auth_codes SET used_at = NOW() WHERE id = $1`, [row.id]);
      return apiError(res, 400, 'CODE_LOCKED', 'Too many wrong attempts. Please request a new code.');
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
      return apiError(res, 400, 'BAD_CODE', 'Incorrect code. Please try again.');
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
    apiError(res, 500, 'INTERNAL', 'Could not verify code.');
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.userId) return apiError(res, 401, 'AUTH_REQUIRED', 'Not signed in.');
  const result = await pool.query('SELECT email, is_paid FROM vs_users WHERE id = $1', [req.userId]);
  if (!result.rows.length) { clearSessionCookie(res); return apiError(res, 401, 'AUTH_REQUIRED', 'Not signed in.'); }
  res.json({ email: result.rows[0].email, is_paid: result.rows[0].is_paid });
});

// ── My videos: list + delete ─────────────────────────────────────────────────
app.get('/api/my-videos', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content_type, uploaded_at, expires_at, view_count, file_size,
              platform, embed_video_id,
              (password_hash IS NOT NULL) AS has_password,
              (thumbnail_data IS NOT NULL) AS has_thumbnail
       FROM vs_uploads
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
      [req.userId]
    );
    res.json({ videos: result.rows });
  } catch (err) {
    console.error('my-videos list error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not load your videos.');
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
    // Defensive: cap batch size, drop non-strings, and reject malformed ids
    // before they reach the database (cheap belt-and-braces).
    const ids = videoIds
      .filter(v => typeof v === 'string' && isValidVideoId(v))
      .slice(0, 50);
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
    apiError(res, 500, 'INTERNAL', 'Could not claim videos.');
  }
});

app.post('/api/my-videos/embed-check', requireUser, express.json(), async (req, res) => {
  try {
    const { videoIds } = req.body || {};
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.json({ results: {} });
    }
    const ids = videoIds
      .filter(v => typeof v === 'string' && isValidVideoId(v))
      .slice(0, 50);
    if (ids.length === 0) return res.json({ results: {} });

    const result = await pool.query(
      `SELECT id, platform, embed_video_id
         FROM vs_uploads
        WHERE id = ANY($1::text[])
          AND user_id = $2
          AND embed_video_id IS NOT NULL`,
      [ids, req.userId]
    );

    const checks = await Promise.allSettled(
      result.rows.map(async (v) => {
        const platform = v.platform || 'upload';
        const available = await checkEmbedAvailability(platform, v.embed_video_id);
        return { id: v.id, available };
      })
    );

    const results = {};
    for (const c of checks) {
      if (c.status === 'fulfilled') {
        results[c.value.id] = { embedAvailable: c.value.available };
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('my-videos embed-check error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not check embed availability.');
  }
});

app.delete('/api/my-videos/:id', requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
    // Ownership check baked into the WHERE — won't touch other users' rows.
    const owned = await pool.query(
      'SELECT 1 FROM vs_uploads WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (!owned.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');
    await pool.query('DELETE FROM vs_upload_chunks WHERE video_id = $1', [id]);
    await pool.query('DELETE FROM vs_uploads WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('my-videos delete error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not delete the video.');
  }
});

app.patch('/api/my-videos/:id', requireUser, express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidVideoId(id)) return apiError(res, 400, 'BAD_VIDEO_ID', 'Invalid video id.');

    const owned = await pool.query(
      'SELECT 1 FROM vs_uploads WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (!owned.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');

    const { title, expiryDays, password } = req.body || {};
    const sets = [];
    const vals = [];
    let idx = 1;

    if (title !== undefined) {
      const trimmed = typeof title === 'string' ? title.trim() : '';
      if (!trimmed) return apiError(res, 400, 'TITLE_REQUIRED', 'Title cannot be empty.');
      if (trimmed.length > 120) return apiError(res, 400, 'TITLE_TOO_LONG', 'Title must be 120 characters or fewer.');
      sets.push(`title = $${idx++}`);
      vals.push(trimmed);
    }

    if (expiryDays !== undefined) {
      const paidUser = await isUserPaid(req.userId);
      if (paidUser) {
        sets.push(`expires_at = $${idx++}`);
        vals.push(null);
      } else if (expiryDays === null || expiryDays === 'never') {
        sets.push(`expires_at = $${idx++}`);
        vals.push(null);
      } else {
        const days = parseInt(expiryDays, 10);
        if (!Number.isInteger(days) || days <= 0 || days > 3650) {
          return apiError(res, 400, 'BAD_EXPIRY', 'Invalid expiry value.');
        }
        sets.push(`expires_at = NOW() + $${idx++}::interval`);
        vals.push(`${days} days`);
      }
    }

    if (password !== undefined) {
      if (password === null || password === '') {
        sets.push(`password_hash = $${idx++}`);
        vals.push(null);
      } else {
        if (typeof password !== 'string') return apiError(res, 400, 'BAD_PASSWORD', 'Invalid password format.');
        if (password.length > 200) return apiError(res, 400, 'PASSWORD_TOO_LONG', 'Password must be 200 characters or fewer.');
        sets.push(`password_hash = $${idx++}`);
        vals.push(hashPassword(password));
      }
    }

    if (sets.length === 0) return apiError(res, 400, 'NO_FIELDS', 'No fields to update.');

    vals.push(id);
    vals.push(req.userId);
    const result = await pool.query(
      `UPDATE vs_uploads SET ${sets.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx++}
       RETURNING title, expires_at, (password_hash IS NOT NULL) AS has_password`,
      vals
    );

    if (!result.rows.length) return apiError(res, 404, 'NOT_FOUND', 'Video not found.');

    res.json({ success: true, video: result.rows[0] });
  } catch (err) {
    console.error('my-videos patch error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not update video.');
  }
});

// ── Admin: toggle paid tier ───────────────────────────────────────────────────
app.patch('/api/admin/users/:id/tier', requireAdmin, express.json(), async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_paid } = req.body || {};
    if (typeof is_paid !== 'boolean') {
      return apiError(res, 400, 'BAD_INPUT', 'is_paid must be a boolean.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'UPDATE vs_users SET is_paid = $1 WHERE id = $2 RETURNING id, email, is_paid',
        [is_paid, userId]
      );
      if (!result.rows.length) {
        await client.query('ROLLBACK');
        return apiError(res, 404, 'NOT_FOUND', 'User not found.');
      }
      if (is_paid) {
        const cleared = await client.query(
          'UPDATE vs_uploads SET expires_at = NULL WHERE user_id = $1 AND expires_at IS NOT NULL',
          [userId]
        );
        if (cleared.rowCount) {
          console.log(`Cleared expiration on ${cleared.rowCount} video(s) for paid user ${userId}`);
        }
      }
      await client.query('COMMIT');
      res.json({ success: true, user: result.rows[0] });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('admin tier toggle error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not update user tier.');
  }
});

// ── Admin: list users ─────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const limit  = Math.max(1, Math.min(200, parseInt(req.query.limit,  10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const tier   = req.query.tier === 'paid' ? 'paid' : req.query.tier === 'free' ? 'free' : '';

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`LOWER(u.email) LIKE $${paramIdx}`);
      params.push('%' + search + '%');
      paramIdx++;
    }
    if (tier === 'paid') {
      conditions.push(`u.is_paid = TRUE`);
    } else if (tier === 'free') {
      conditions.push(`u.is_paid = FALSE`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM vs_users u ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limit);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const result = await pool.query(
      `SELECT u.id, u.email, u.is_paid, u.created_at,
              COUNT(v.id)::int AS video_count
       FROM vs_users u
       LEFT JOIN vs_uploads v ON v.user_id = u.id
       ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    res.json({ users: result.rows, total, limit, offset });
  } catch (err) {
    console.error('admin list users error:', err);
    apiError(res, 500, 'INTERNAL', 'Could not list users.');
  }
});

// ── Clean URL routes ──────────────────────────────────────────────────────────
app.get('/upload',  (req, res) => res.sendFile(path.join(__dirname, 'upload.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login',   (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'account.html')));
app.get('/oz',      (req, res) => res.sendFile(path.join(__dirname, 'oz.html')));
app.get('/disc',    (req, res) => res.sendFile(path.join(__dirname, 'disc.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
// When run directly (`node server.js`) start the HTTP listener and the
// background timers. When required from tests we just want the configured
// Express app and the pool, without any side effects.
if (require.main === module) {
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
}

module.exports = { app, pool, uploadCounts, embedAvailabilityCache };
