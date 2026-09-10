/**
 * bunny-discard-upload
 *
 * Purpose: Remove a Bunny Stream video object whose browser upload was
 * cancelled or failed, so abandoned uploads do not pile up in the library.
 * Refuses to delete anything that a saved show page still references.
 *
 * Request Body: { page: string, videoId: string }
 * Auth: page-editor credential for `page`
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { query } = require('../lib/page-store');
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
  if (!bunny.isValidVideoId(body.videoId)) {
    return respond(400, headers, { error: { code: 'BAD_VIDEO_ID', message: 'Invalid video id.' } });
  }

  const authResult = await requirePageAuth(event, page);
  if (!authResult.authorized) return authResult.response;

  if (!bunny.isConfigured()) {
    return respond(503, headers, {
      error: { code: 'BUNNY_NOT_CONFIGURED', message: 'Video uploads are not configured on the server.' }
    });
  }

  try {
    const inUse = await query(
      'SELECT 1 FROM videos WHERE wistia_id = $1 AND platform = \'bunny\' LIMIT 1', [body.videoId]
    );
    if (inUse.rows.length) {
      return respond(409, headers, {
        error: { code: 'IN_USE', message: 'That video is saved on a page and was not deleted.' }
      });
    }
    await bunny.deleteVideo(body.videoId);
    return respond(200, headers, { success: true, videoId: body.videoId });
  } catch (error) {
    if (error.status === 404) {
      return respond(200, headers, { success: true, videoId: body.videoId, alreadyGone: true });
    }
    console.error('bunny-discard-upload failed:', error.message);
    return respond(502, headers, {
      error: { code: 'BUNNY_UPSTREAM', message: 'Could not delete the video from Bunny Stream.' }
    });
  }
};
