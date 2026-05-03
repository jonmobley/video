/**
 * Netlify Function: upload-link-thumbnail
 *
 * Stores a captured frame for an external-link video (e.g. Dropbox URL)
 * in the `video-uploads` blob store under `link-thumbnails/<id>`.
 * Mirrors POST /api/upload-link-thumbnail in server.js so deployments
 * routed through Netlify Functions persist link thumbnails the same way.
 */

const { getStore } = require('@netlify/blobs');

const MAX_THUMBNAIL_BYTES = 500 * 1024;
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return apiError(400, headers, 'BAD_JSON', 'Request body is not valid JSON.'); }

  const { id, data, contentType } = body;
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    return apiError(400, headers, 'BAD_ID', 'Invalid thumbnail id.');
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
    const key = `link-thumbnails/${id}`;
    // Idempotent: don't clobber an earlier capture.
    const existing = await store.get(key, { type: 'arrayBuffer' });
    if (!existing) {
      await store.set(key, buf, {
        metadata: { contentType: contentType.toLowerCase(), uploadedAt: new Date().toISOString() }
      });
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, thumbnailUrl: `/api/link-thumbnail/${id}` })
    };
  } catch (err) {
    console.error('upload-link-thumbnail error:', err);
    return apiError(500, headers, 'INTERNAL', 'Failed to store thumbnail.');
  }
};
