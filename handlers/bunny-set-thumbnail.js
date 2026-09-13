/**
 * bunny-set-thumbnail
 *
 * Purpose: Replace the thumbnail of a Bunny Stream video from the show-page
 * editor. Accepts either an image the editor picked/uploaded in the browser
 * (base64) or one of Bunny's own auto-generated candidate frames (URL on our
 * pull zone). Any saved `videos` rows for the video get the new URL so the
 * change shows without re-saving the page.
 *
 * Request Body: { page, videoId, data?, contentType?, thumbnailUrl? }
 * Auth: page-editor credential for `page`
 *
 * Response: { success, videoId, thumbnailUrl, hasCustomThumbnail }
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { query } = require('../lib/page-store');
const bunny = require('../lib/bunny-stream');

const PAGE_RE = /^[a-z0-9_-]{1,64}$/;
const MAX_THUMB_BYTES = 500 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function respond(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function fail(headers, statusCode, code, message) {
  return respond(statusCode, headers, { error: { code, message } });
}

function decodeImage(data, contentType, headers) {
  if (typeof data !== 'string' || !data.trim()) {
    return { error: fail(headers, 400, 'EMPTY_THUMB', 'Thumbnail data is empty.') };
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return { error: fail(headers, 415, 'UNSUPPORTED_TYPE', 'Unsupported thumbnail type. Use JPEG, PNG, or WebP.') };
  }
  const cleaned = data.replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(cleaned)) {
    return { error: fail(headers, 400, 'BAD_BASE64', 'Thumbnail data is not valid base64.') };
  }
  // Reject before decoding so oversized payloads never get buffered.
  if (Math.floor(cleaned.length * 0.75) > MAX_THUMB_BYTES + 1024) {
    return { error: fail(headers, 413, 'PAYLOAD_TOO_LARGE', 'Thumbnail too large. Max 500 KB.') };
  }
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length) {
    return { error: fail(headers, 400, 'EMPTY_THUMB', 'Thumbnail decoded to 0 bytes.') };
  }
  if (buffer.length > MAX_THUMB_BYTES) {
    return { error: fail(headers, 413, 'PAYLOAD_TOO_LARGE', 'Thumbnail too large. Max 500 KB.') };
  }
  return { buffer };
}

exports.handler = async (event) => {
  const headers = getSecuredCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return fail(headers, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return fail(headers, 400, 'BAD_JSON', 'Request body is not valid JSON.');
  }

  const page = typeof body.page === 'string' ? body.page : '';
  if (!PAGE_RE.test(page)) {
    return fail(headers, 400, 'BAD_PAGE', 'Invalid page ID.');
  }
  const videoId = body.videoId;
  if (!bunny.isValidVideoId(videoId)) {
    return fail(headers, 400, 'BAD_VIDEO_ID', 'Invalid video id.');
  }

  const authResult = await requirePageAuth(event, page);
  if (!authResult.authorized) return authResult.response;

  if (!bunny.isConfigured()) {
    return fail(headers, 503, 'BUNNY_NOT_CONFIGURED', 'Video uploads are not configured on the server.');
  }

  let source;
  if (typeof body.thumbnailUrl === 'string' && body.thumbnailUrl) {
    if (!bunny.isCandidateThumbnailUrl(body.thumbnailUrl, videoId)) {
      return fail(headers, 400, 'BAD_THUMBNAIL_URL', 'Only this video\u2019s own generated frames can be chosen by URL.');
    }
    source = { url: body.thumbnailUrl };
  } else {
    const decoded = decodeImage(body.data, body.contentType, headers);
    if (decoded.error) return decoded.error;
    source = { buffer: decoded.buffer, contentType: body.contentType };
  }

  let result;
  try {
    result = await bunny.setThumbnail(videoId, source);
  } catch (error) {
    console.error('bunny-set-thumbnail failed:', error.message);
    if (error.status === 404) {
      return fail(headers, 404, 'NOT_FOUND', 'Video not found in Bunny Stream.');
    }
    return fail(headers, 502, 'BUNNY_UPSTREAM', 'Could not update the thumbnail in Bunny Stream.');
  }

  // Best effort: rows that already reference this video pick up the new URL
  // straight away. Unsaved grid items carry it in the next save-videos call.
  if (result.thumbnailUrl) {
    try {
      await query(
        'UPDATE videos SET thumbnail_url = $1 WHERE wistia_id = $2 AND platform = \'bunny\'',
        [result.thumbnailUrl, videoId]
      );
    } catch (error) {
      console.warn('bunny-set-thumbnail: could not update videos.thumbnail_url:', error.message);
    }
  }

  return respond(200, headers, {
    success: true,
    videoId,
    thumbnailUrl: result.thumbnailUrl,
    hasCustomThumbnail: result.hasCustomThumbnail
  });
};
