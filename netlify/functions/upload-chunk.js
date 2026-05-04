const { getStore } = require('@netlify/blobs');
const { checkRateLimit, getClientIp, rateLimitResponse } = require('./utils/rate-limit');

const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB raw chunk max
const VIDEO_ID_RE = /^[a-f0-9]{12,64}(\.[a-z0-9]{1,8})?$/i;
const ALLOWED_VIDEO_TYPES = /^(video\/|application\/octet-stream$)/i;
const MAX_UPLOADS_PER_HOUR = 10;

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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return apiError(405, headers, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }

  try {
    if (event.body && event.body.length > 8 * 1024 * 1024) {
      return apiError(413, headers, 'PAYLOAD_TOO_LARGE', 'Payload too large.');
    }
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return apiError(400, headers, 'BAD_JSON', 'Request body is not valid JSON.'); }

    const { videoId, chunkIndex, totalChunks, data, contentType } = body;

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100000) {
      return apiError(400, headers, 'BAD_CHUNK_INDEX', 'Invalid chunkIndex.');
    }

    if (chunkIndex === 0) {
      const ip = getClientIp(event);
      const result = await checkRateLimit(ip, 'upload', MAX_UPLOADS_PER_HOUR, 60);
      if (result.limited) {
        return rateLimitResponse(headers, result.retryAfter);
      }
    }

    if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) {
      return apiError(400, headers, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 100000) {
      return apiError(400, headers, 'BAD_TOTAL_CHUNKS', 'Invalid totalChunks.');
    }
    if (chunkIndex >= totalChunks) {
      return apiError(400, headers, 'BAD_CHUNK_INDEX', 'chunkIndex must be < totalChunks.');
    }
    if (typeof contentType !== 'string' || !ALLOWED_VIDEO_TYPES.test(contentType)) {
      return apiError(415, headers, 'UNSUPPORTED_TYPE', 'Unsupported content type.');
    }
    if (typeof data !== 'string' || data.length === 0) {
      return apiError(400, headers, 'EMPTY_CHUNK', 'Chunk data is empty.');
    }
    if (data.length > MAX_CHUNK_SIZE * 1.4) {
      return apiError(413, headers, 'PAYLOAD_TOO_LARGE', 'Chunk too large.');
    }

    const chunkBuffer = Buffer.from(data, 'base64');
    if (chunkBuffer.length === 0) {
      return apiError(400, headers, 'EMPTY_CHUNK', 'Chunk data decoded to 0 bytes.');
    }
    if (chunkBuffer.length > MAX_CHUNK_SIZE) {
      return apiError(413, headers, 'PAYLOAD_TOO_LARGE', 'Chunk too large.');
    }

    const store = getStore('video-uploads');
    const chunkKey = `chunks/${videoId}/${String(chunkIndex).padStart(6, '0')}`;

    await store.set(chunkKey, chunkBuffer, {
      metadata: { contentType, chunkIndex, totalChunks, videoId }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, chunkIndex, totalChunks })
    };
  } catch (err) {
    console.error('upload-chunk error:', err);
    return apiError(500, headers, 'INTERNAL', 'Upload failed.');
  }
};
