/**
 * bunny-video-status
 *
 * Purpose: Report Bunny Stream processing state for a video the editor just
 * uploaded, so the page editor can show "processing" until playback is ready.
 *
 * Query Parameters: page (string), videoId (Bunny GUID)
 * Auth: page-editor credential for `page`
 *
 * Response: { videoId, status, encodeProgress, length, thumbnailUrl, previewUrl, ready }
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const bunny = require('../lib/bunny-stream');

const PAGE_RE = /^[a-z0-9_-]{1,64}$/;
const READY_STATUSES = new Set(['finished', 'jit_segmenting', 'jit_playlists_created']);

function respond(statusCode, headers, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}

exports.handler = async (event) => {
  const headers = {
    ...getSecuredCorsHeaders(),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return respond(405, headers, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
  }

  const params = event.queryStringParameters || {};
  const page = typeof params.page === 'string' ? params.page : '';
  if (!PAGE_RE.test(page)) {
    return respond(400, headers, { error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } });
  }
  if (!bunny.isValidVideoId(params.videoId)) {
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
    const video = await bunny.getVideo(params.videoId);
    return respond(200, headers, {
      videoId: video.videoId,
      status: video.status,
      encodeProgress: video.encodeProgress,
      length: video.length,
      width: video.width,
      height: video.height,
      thumbnailUrl: bunny.thumbnailUrl(video.videoId, process.env, video.thumbnailFileName),
      previewUrl: bunny.previewUrl(video.videoId),
      ready: READY_STATUSES.has(video.status)
    });
  } catch (error) {
    console.error('bunny-video-status failed:', error.message);
    const status = error.status === 404 ? 404 : 502;
    return respond(status, headers, {
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'BUNNY_UPSTREAM',
        message: status === 404 ? 'Video not found in Bunny Stream.' : 'Could not reach Bunny Stream.'
      }
    });
  }
};
