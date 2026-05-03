/**
 * Netlify Function: get-video-thumbnail
 *
 * Serves a previously-stored thumbnail bytes for a finalized upload.
 * Mirrors GET /api/video-thumbnail/:id in server.js.
 *
 * Routed via netlify.toml from /api/video-thumbnail/:id.
 */

const { getStore } = require('@netlify/blobs');

const VIDEO_ID_RE = /^[a-f0-9]{12,64}(\.[a-z0-9]{1,8})?$/i;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=86400'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  // Path comes through as `/api/video-thumbnail/<id>` after the netlify
  // redirect; pull the trailing segment defensively.
  const segments = (event.path || '').split('/').filter(Boolean);
  const videoId = segments[segments.length - 1];

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'BAD_VIDEO_ID', message: 'Invalid video id.' } })
    };
  }

  try {
    const store = getStore('video-uploads');
    const key = `thumbnails/${videoId}`;
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result || !result.data) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Thumbnail not found.' } })
      };
    }
    const contentType = (result.metadata && result.metadata.contentType) || 'image/jpeg';
    const buf = Buffer.from(result.data);
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': contentType },
      body: buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('get-video-thumbnail error:', err);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Failed to load thumbnail.' } })
    };
  }
};
