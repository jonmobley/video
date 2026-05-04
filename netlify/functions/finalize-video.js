const { getStore } = require('@netlify/blobs');
const { checkRateLimit, getClientIp, rateLimitResponse } = require('./utils/rate-limit');

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB assembled cap
const VIDEO_ID_RE = /^[a-f0-9]{12,64}(\.[a-z0-9]{1,8})?$/i;
const ALLOWED_VIDEO_TYPES = /^(video\/|application\/octet-stream$)/i;
const MAX_FINALIZE_PER_HOUR = 10;

function apiError(statusCode, headers, code, message) {
  return { statusCode, headers, body: JSON.stringify({ error: { code, message } }) };
}

async function deleteChunks(store, videoId, totalChunks) {
  for (let i = 0; i < totalChunks; i++) {
    const key = `chunks/${videoId}/${String(i).padStart(6, '0')}`;
    await store.delete(key).catch(() => {});
  }
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

  let videoId, totalChunks;
  let store;
  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return apiError(400, headers, 'BAD_JSON', 'Request body is not valid JSON.'); }

    const ip = getClientIp(event);
    const rlResult = await checkRateLimit(ip, 'finalize', MAX_FINALIZE_PER_HOUR, 60);
    if (rlResult.limited) {
      return rateLimitResponse(headers, rlResult.retryAfter);
    }

    const contentType = body.contentType;
    videoId = body.videoId;
    totalChunks = body.totalChunks;

    if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) {
      return apiError(400, headers, 'BAD_VIDEO_ID', 'Invalid video id.');
    }
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 100000) {
      return apiError(400, headers, 'BAD_TOTAL_CHUNKS', 'Invalid totalChunks.');
    }
    if (typeof contentType !== 'string' || !ALLOWED_VIDEO_TYPES.test(contentType)) {
      return apiError(415, headers, 'UNSUPPORTED_TYPE', 'Unsupported content type.');
    }

    store = getStore('video-uploads');

    // Read and concatenate all chunks in order. Any missing chunk is treated
    // as a hard integrity failure — we wipe the partial upload so the client
    // can retry from scratch without leaking storage.
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `chunks/${videoId}/${String(i).padStart(6, '0')}`;
      const chunkBlob = await store.get(chunkKey, { type: 'arrayBuffer' });
      if (!chunkBlob) {
        await deleteChunks(store, videoId, totalChunks);
        return apiError(400, headers, 'CHUNK_INTEGRITY', `Missing chunk ${i}. Please retry the upload.`);
      }
      chunks.push(Buffer.from(chunkBlob));
    }

    const assembled = Buffer.concat(chunks);

    if (assembled.length === 0) {
      await deleteChunks(store, videoId, totalChunks);
      return apiError(400, headers, 'EMPTY_FILE', 'Assembled file is empty.');
    }
    if (assembled.length > MAX_FILE_SIZE) {
      await deleteChunks(store, videoId, totalChunks);
      return apiError(413, headers, 'FILE_TOO_LARGE', `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
    }

    await store.set(videoId, assembled, {
      metadata: { contentType, uploadedAt: new Date().toISOString() }
    });

    // Clean up chunks now that the assembled file is safely stored.
    await deleteChunks(store, videoId, totalChunks);

    const videoUrl = `/.netlify/blobs/video-uploads/${videoId}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, videoUrl })
    };
  } catch (err) {
    console.error('finalize-video error:', err);
    // Best-effort cleanup of any partial chunks before reporting failure.
    if (store && videoId && totalChunks) {
      await deleteChunks(store, videoId, totalChunks).catch(() => {});
    }
    return apiError(500, headers, 'INTERNAL', 'Finalize failed.');
  }
};
