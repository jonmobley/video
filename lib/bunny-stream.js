// Bunny Stream integration for show-page video hosting.
//
// Editors upload files straight from the browser to Bunny's TUS endpoint using
// a short-lived signature minted here, so the Stream API key never leaves the
// server. Credentials come from environment variables:
//
//   BUNNY_STREAM_LIBRARY_ID    numeric video library id
//   BUNNY_STREAM_API_KEY       the library's Stream API key (not the account key)
//   BUNNY_STREAM_CDN_HOSTNAME  the library's pull zone, e.g. vz-abc123-def.b-cdn.net
//                              (used for thumbnails / preview animations)

const crypto = require('crypto');

// Overridable so a local stand-in for the Stream API can be used in development.
const STREAM_API_BASE = String(process.env.BUNNY_STREAM_API_BASE || 'https://video.bunnycdn.com').replace(/\/+$/, '');
const TUS_ENDPOINT = `${STREAM_API_BASE}/tusupload`;
const EMBED_BASE = 'https://player.mediadelivery.net/embed';
// Bunny requires the TUS signature to stay valid for at least an hour; give
// slow connections plenty of headroom for multi-GB files.
const UPLOAD_SIGNATURE_TTL_SECONDS = 12 * 60 * 60;

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bunny video `status` values.
const VIDEO_STATUS = {
  0: 'created',
  1: 'uploaded',
  2: 'processing',
  3: 'transcoding',
  4: 'finished',
  5: 'error',
  6: 'upload_failed',
  7: 'jit_segmenting',
  8: 'jit_playlists_created'
};

function readConfig(env = process.env) {
  const libraryId = String(env.BUNNY_STREAM_LIBRARY_ID || '').trim();
  const apiKey = String(env.BUNNY_STREAM_API_KEY || '').trim();
  const cdnHostname = String(env.BUNNY_STREAM_CDN_HOSTNAME || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  return { libraryId, apiKey, cdnHostname };
}

function isConfigured(env = process.env) {
  const { libraryId, apiKey } = readConfig(env);
  return /^\d+$/.test(libraryId) && apiKey.length > 0;
}

function isValidVideoId(videoId) {
  return typeof videoId === 'string' && GUID_RE.test(videoId);
}

/**
 * Presigned TUS signature: hex SHA-256 of libraryId + apiKey + expires + videoId.
 */
function tusSignature({ libraryId, apiKey, expires, videoId }) {
  return crypto
    .createHash('sha256')
    .update(`${libraryId}${apiKey}${expires}${videoId}`)
    .digest('hex');
}

function embedUrl(videoId, env = process.env) {
  const { libraryId } = readConfig(env);
  return `${EMBED_BASE}/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}`;
}

function thumbnailUrl(videoId, env = process.env, fileName = 'thumbnail.jpg') {
  const { cdnHostname } = readConfig(env);
  if (!cdnHostname) return null;
  return `https://${cdnHostname}/${encodeURIComponent(videoId)}/${encodeURIComponent(fileName)}`;
}

function previewUrl(videoId, env = process.env) {
  return thumbnailUrl(videoId, env, 'preview.webp');
}

async function streamApi(path, { method = 'GET', body, env = process.env, fetchImpl = fetch } = {}) {
  const { libraryId, apiKey } = readConfig(env);
  const response = await fetchImpl(`${STREAM_API_BASE}/library/${libraryId}${path}`, {
    method,
    headers: {
      AccessKey: apiKey,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!response.ok) {
    const detail = (data && (data.Message || data.message || data.title)) || text.slice(0, 200);
    const error = new Error(`Bunny Stream ${method} ${path} failed (${response.status})${detail ? `: ${detail}` : ''}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * Create an empty video object; the browser then streams the file into it via TUS.
 * @returns {Promise<{ videoId: string }>}
 */
async function createVideo(title, options = {}) {
  const data = await streamApi('/videos', {
    method: 'POST',
    body: { title: String(title || 'Untitled video').slice(0, 200) },
    ...options
  });
  if (!data || !isValidVideoId(data.guid)) {
    throw new Error('Bunny Stream did not return a video id.');
  }
  return { videoId: data.guid };
}

/**
 * Build everything the browser needs for a presigned TUS upload.
 */
function buildUploadCredentials(videoId, env = process.env, now = Date.now()) {
  const { libraryId, apiKey } = readConfig(env);
  const expires = Math.floor(now / 1000) + UPLOAD_SIGNATURE_TTL_SECONDS;
  return {
    tusEndpoint: TUS_ENDPOINT,
    libraryId,
    videoId,
    expires,
    signature: tusSignature({ libraryId, apiKey, expires, videoId })
  };
}

async function getVideo(videoId, options = {}) {
  if (!isValidVideoId(videoId)) throw new Error('Invalid Bunny video id.');
  const data = await streamApi(`/videos/${videoId}`, options);
  return {
    videoId: data.guid,
    title: data.title,
    status: VIDEO_STATUS[data.status] || 'unknown',
    statusCode: data.status,
    encodeProgress: Number(data.encodeProgress) || 0,
    length: Number(data.length) || 0,
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
    thumbnailFileName: data.thumbnailFileName || 'thumbnail.jpg'
  };
}

async function deleteVideo(videoId, options = {}) {
  if (!isValidVideoId(videoId)) throw new Error('Invalid Bunny video id.');
  await streamApi(`/videos/${videoId}`, { method: 'DELETE', ...options });
}

module.exports = {
  STREAM_API_BASE,
  TUS_ENDPOINT,
  EMBED_BASE,
  UPLOAD_SIGNATURE_TTL_SECONDS,
  VIDEO_STATUS,
  readConfig,
  isConfigured,
  isValidVideoId,
  tusSignature,
  embedUrl,
  thumbnailUrl,
  previewUrl,
  createVideo,
  buildUploadCredentials,
  getVideo,
  deleteVideo
};
