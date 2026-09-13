/**
 * bunny-create-upload
 *
 * Purpose: Start a direct browser-to-Bunny Stream upload for a show page.
 *
 * Creates an empty video object in the configured Bunny Stream library and
 * returns presigned TUS credentials. The browser streams the file to Bunny
 * itself; the Stream API key never leaves the server.
 *
 * Request Body: { page: string, title: string }
 * Auth: page-editor credential for `page` (same as save-videos)
 *
 * Response: {
 *   videoId, libraryId, tusEndpoint, signature, expires,
 *   platform: 'bunny', embedUrl, thumbnailUrl
 * }
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const bunny = require('../lib/bunny-stream');

const PAGE_RE = /^[a-z0-9_-]{1,64}$/;

function respond(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const headers = getSecuredCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return respond(405, headers, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, headers, { error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
  }

  const page = typeof body.page === 'string' ? body.page : '';
  if (!PAGE_RE.test(page)) {
    return respond(400, headers, { error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200) {
    return respond(400, headers, { error: { code: 'BAD_TITLE', message: 'A video title (1-200 characters) is required.' } });
  }

  const authResult = await requirePageAuth(event, page);
  if (!authResult.authorized) return authResult.response;

  if (!bunny.isConfigured()) {
    return respond(503, headers, {
      error: {
        code: 'BUNNY_NOT_CONFIGURED',
        message: 'Video uploads are not configured. Set BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY on the server.'
      }
    });
  }

  try {
    const { videoId } = await bunny.createVideo(title);
    const credentials = bunny.buildUploadCredentials(videoId);
    return respond(200, headers, {
      ...credentials,
      platform: 'bunny',
      embedUrl: bunny.embedUrl(videoId),
      thumbnailUrl: bunny.thumbnailUrl(videoId)
    });
  } catch (error) {
    console.error('bunny-create-upload failed:', error.message);
    return respond(502, headers, {
      error: { code: 'BUNNY_UPSTREAM', message: 'Could not start the upload with Bunny Stream. Check the library id and API key.' }
    });
  }
};
