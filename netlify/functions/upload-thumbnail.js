/**
 * Netlify Function: upload-thumbnail
 *
 * Stores a captured frame for a previously-finalized video upload in the
 * `video-uploads` blob store under the key `thumbnails/<videoId>`.
 *
 * Mirrors POST /api/upload-thumbnail in server.js so that deployments
 * routed through Netlify Functions persist thumbnails the same way.
 */

const { getStore } = require('@netlify/blobs');
const { checkRateLimit, getClientIp, rateLimitResponse } = require('./utils/rate-limit');

const MAX_THUMBNAIL_BYTES = 500 * 1024;
const VIDEO_ID_RE = /^[a-f0-9]{12,64}(\.[a-z0-9]{1,8})?$/i;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_THUMBNAILS_PER_HOUR = 20;

function apiError(statusCode, headers, code, message) {
  return { statusCode, headers, body: JSON.stringify({ error: { code, message } }) };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return apiError(405, headers, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  const ip = getClientIp(event);
  const rlResult = await checkRateLimit(ip, 'thumbnail', MAX_THUMBNAILS_PER_HOUR, 60);
  if (rlResult.limited) {
    return rateLimitResponse(headers, rlResult.retryAfter);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return apiError(400, headers, 'BAD_JSON', 'Request body is not valid JSON.'); }

  const { videoId, data, contentType } = body;
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) {
    return apiError(400, headers, 'BAD_VIDEO_ID', 'Invalid video id.');
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPES.has(contentType.toLowerCase())) {
    return apiError(415, headers, 'UNSUPPORTED_TYPE', 'Unsupported thumbnail content type.');
  }
  if (typeof data !== 'string' || !data.length) {
    return apiError(400, headers, 'BAD_DATA', 'Missing thumbnail data.');
  }

  let buf;
  try { buf = Buffer.from(data, 'base64'); }
  catch { return apiError(400, headers, 'BAD_BASE64', 'Thumbnail data is not valid base64.'); }
  if (buf.length === 0) {
    return apiError(400, headers, 'EMPTY_THUMBNAIL', 'Thumbnail is empty.');
  }
  if (buf.length > MAX_THUMBNAIL_BYTES) {
    return apiError(413, headers, 'THUMBNAIL_TOO_LARGE',
      `Thumbnail too large. Max ${MAX_THUMBNAIL_BYTES / 1024} KB.`);
  }

  try {
    const store = getStore('video-uploads');
    // Confirm the parent video exists so callers can't upload orphan
    // thumbnails for videos they didn't finalize.
    const videoExists = await store.get(videoId, { type: 'arrayBuffer' });
    if (!videoExists) {
      return apiError(404, headers, 'NOT_FOUND', 'Video not found.');
    }
    const key = `thumbnails/${videoId}`;
    const existing = await store.get(key, { type: 'arrayBuffer' });
    if (existing) {
      // Match the Express endpoint: refuse overwrites; replace flow is a follow-up.
      return apiError(409, headers, 'ALREADY_EXISTS', 'Thumbnail already exists.');
    }
    await store.set(key, buf, {
      metadata: { contentType: contentType.toLowerCase(), uploadedAt: new Date().toISOString() }
    });

    // Best-effort: write the public thumbnail URL onto any matching
    // `videos` row in Supabase so the public listings (powered by
    // get-videos) pick it up. Failures here are non-fatal because the
    // thumbnail bytes are already safely stored above.
    const thumbnailUrl = `/api/video-thumbnail/${videoId}`;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('videos').update({ thumbnail_url: thumbnailUrl }).eq('id', videoId);
      } catch (supaErr) {
        console.warn('Supabase thumbnail_url update failed:', supaErr.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, thumbnailUrl })
    };
  } catch (err) {
    console.error('upload-thumbnail error:', err);
    return apiError(500, headers, 'INTERNAL', 'Failed to store thumbnail.');
  }
};
