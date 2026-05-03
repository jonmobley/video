/**
 * Netlify Function: get-link-thumbnail
 *
 * Serves a previously-stored frame for an external-link video.
 * Mirrors GET /api/link-thumbnail/:id in server.js.
 * Routed via netlify.toml from /api/link-thumbnail/:id.
 */

const { getStore } = require('@netlify/blobs');

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

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

  const segments = (event.path || '').split('/').filter(Boolean);
  const id = segments[segments.length - 1];

  if (!id || !ID_RE.test(id)) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'BAD_ID', message: 'Invalid thumbnail id.' } })
    };
  }

  try {
    const store = getStore('video-uploads');
    const result = await store.getWithMetadata(`link-thumbnails/${id}`, { type: 'arrayBuffer' });
    if (!result || !result.data) {
      return {
        statusCode: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Thumbnail not found.' } })
      };
    }
    const contentType = (result.metadata && result.metadata.contentType) || 'image/jpeg';
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': contentType },
      body: Buffer.from(result.data).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('get-link-thumbnail error:', err);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Failed to load thumbnail.' } })
    };
  }
};
