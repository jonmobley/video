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
const DEFAULT_THUMBNAIL_FILE = 'thumbnail.jpg';

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

function thumbnailUrl(videoId, env = process.env, fileName = DEFAULT_THUMBNAIL_FILE) {
  const { cdnHostname } = readConfig(env);
  if (!cdnHostname) return null;
  return `https://${cdnHostname}/${encodeURIComponent(videoId)}/${encodeURIComponent(fileName)}`;
}

function previewUrl(videoId, env = process.env) {
  return thumbnailUrl(videoId, env, 'preview.webp');
}

// After encoding, Bunny publishes five evenly spaced frames alongside the
// default thumbnail.jpg. These double as "pick a frame" candidates for videos
// whose original file is no longer in the browser.
const CANDIDATE_THUMBNAIL_COUNT = 5;

function candidateThumbnailUrls(videoId, env = process.env) {
  const urls = [];
  for (let i = 1; i <= CANDIDATE_THUMBNAIL_COUNT; i++) {
    const url = thumbnailUrl(videoId, env, `thumbnail_${i}.jpg`);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * True only for one of Bunny's own auto-generated thumbnails for this exact
 * video on our configured pull zone. Used so the "set thumbnail from URL"
 * path cannot be pointed at arbitrary hosts.
 */
function isCandidateThumbnailUrl(url, videoId, env = process.env) {
  if (typeof url !== 'string' || !isValidVideoId(videoId)) return false;
  const { cdnHostname } = readConfig(env);
  if (!cdnHostname) return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.host.toLowerCase() !== cdnHostname.toLowerCase()) return false;
  if (parsed.search || parsed.hash) return false;
  const match = /^\/([0-9a-f-]{36})\/(thumbnail(?:_[1-5])?\.jpg)$/i.exec(parsed.pathname);
  return !!match && match[1].toLowerCase() === videoId.toLowerCase();
}

async function streamApi(path, {
  method = 'GET', body, rawBody, contentType, query, env = process.env, fetchImpl = fetch
} = {}) {
  const { libraryId, apiKey } = readConfig(env);
  let url = `${STREAM_API_BASE}/library/${libraryId}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const headers = { AccessKey: apiKey, Accept: 'application/json' };
  let payload;
  if (rawBody) {
    headers['Content-Type'] = contentType || 'application/octet-stream';
    payload = rawBody;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetchImpl(url, { method, headers, body: payload });
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
    thumbnailFileName: data.thumbnailFileName || DEFAULT_THUMBNAIL_FILE,
    hasCustomThumbnail: !!data.thumbnailFileName && data.thumbnailFileName !== DEFAULT_THUMBNAIL_FILE
  };
}

async function deleteVideo(videoId, options = {}) {
  if (!isValidVideoId(videoId)) throw new Error('Invalid Bunny video id.');
  await streamApi(`/videos/${videoId}`, { method: 'DELETE', ...options });
}

/**
 * Replace a video's thumbnail. Pass either `{ buffer, contentType }` to upload
 * an image, or `{ url }` to have Bunny fetch one (restricted by callers to
 * Bunny's own candidate frames). Resolves with the resulting thumbnail URL,
 * read back from the video record so custom file names are honoured.
 */
async function setThumbnail(videoId, source, options = {}) {
  if (!isValidVideoId(videoId)) throw new Error('Invalid Bunny video id.');
  if (source && source.url) {
    await streamApi(`/videos/${videoId}/thumbnail`, { method: 'POST', query: { thumbnailUrl: source.url }, ...options });
  } else if (source && Buffer.isBuffer(source.buffer) && source.buffer.length) {
    await streamApi(`/videos/${videoId}/thumbnail`, {
      method: 'POST',
      rawBody: source.buffer,
      contentType: source.contentType || 'application/octet-stream',
      ...options
    });
  } else {
    throw new Error('setThumbnail needs a url or an image buffer.');
  }
  const video = await getVideo(videoId, options);
  const env = options.env || process.env;
  let url = thumbnailUrl(videoId, env, video.thumbnailFileName);
  // Bunny gives custom thumbnails a fresh file name; if it kept the default
  // name, add a version so CDN/browser caches do not keep the old frame.
  if (url && !video.hasCustomThumbnail) url += `?v=${Date.now()}`;
  return {
    thumbnailUrl: url,
    thumbnailFileName: video.thumbnailFileName,
    hasCustomThumbnail: video.hasCustomThumbnail
  };
}

module.exports = {
  STREAM_API_BASE,
  TUS_ENDPOINT,
  EMBED_BASE,
  UPLOAD_SIGNATURE_TTL_SECONDS,
  VIDEO_STATUS,
  DEFAULT_THUMBNAIL_FILE,
  CANDIDATE_THUMBNAIL_COUNT,
  readConfig,
  isConfigured,
  isValidVideoId,
  tusSignature,
  embedUrl,
  thumbnailUrl,
  previewUrl,
  candidateThumbnailUrls,
  isCandidateThumbnailUrl,
  createVideo,
  buildUploadCredentials,
  getVideo,
  deleteVideo,
  setThumbnail
};
