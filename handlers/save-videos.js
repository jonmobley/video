/**
 * Netlify Function: save-videos
 * 
 * Purpose: Saves video data to Supabase, replacing existing videos for a page
 * 
 * Request Body:
 *   - Legacy format: Array of video objects (defaults to 'oz' page)
 *   - New format: { videos: Array, page: String }
 * 
 * Video Object Requirements:
 *   - id: Unique identifier
 *   - wistiaId: Wistia platform ID
 *   - title: Display title
 *   - category: Category ID reference
 *   - tags (optional): Array of tag strings
 *   - urlString (optional): Generated if not provided
 *   - order (optional): Display order
 * 
 * Features:
 *   - Automatic URL string generation for direct video links
 *   - Multi-page support with page isolation
 *   - Validates video data before saving
 *   - Replaces all videos for the specified page
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { getPool } = require('../lib/page-store');

const VIDEO_TOKEN_RE = /^[^\s<>"'`]{1,256}$/;
const ALLOWED_PLATFORMS = new Set(['wistia', 'vimeo', 'youtube', 'dropbox', 'dailymotion', 'loom', 'upload']);

function validateVideoRecord(video) {
  if (!video || typeof video !== 'object') return 'Invalid video data structure.';
  if (typeof video.id !== 'string' || !VIDEO_TOKEN_RE.test(video.id)) return 'Invalid video id.';
  if (typeof video.title !== 'string' || !video.title.trim() || video.title.length > 200) return 'Invalid video title.';
  if (typeof video.category !== 'string' || !video.category.trim() || video.category.length > 64 || /[<>]/.test(video.category)) {
    return 'Invalid video category.';
  }
  if (typeof video.wistiaId !== 'string' || !VIDEO_TOKEN_RE.test(video.wistiaId)) return 'Invalid wistiaId.';
  if (video.platform !== undefined && video.platform !== null &&
      (typeof video.platform !== 'string' || !ALLOWED_PLATFORMS.has(video.platform))) {
    return 'Invalid video platform.';
  }
  if (video.video_url !== undefined && video.video_url !== null && video.video_url !== '') {
    if (typeof video.video_url !== 'string' || video.video_url.length > 2048 ||
        !/^(https?:\/\/|\/)/i.test(video.video_url)) {
      return 'Invalid video_url.';
    }
  }
  if (video.tags !== undefined && video.tags !== null) {
    if (!Array.isArray(video.tags) || video.tags.length > 32) return 'Invalid video tags.';
    for (const tag of video.tags) {
      if (typeof tag !== 'string' || tag.length > 64 || /[<>]/.test(tag)) return 'Invalid video tag.';
    }
  }
  return null;
}

/**
 * Generate a persistent URL string for a video based on its Wistia ID
 * This creates a consistent, short URL-friendly string for direct video links
 * 
 * @param {string} wistiaId - The Wistia video ID
 * @returns {string} A consistent 6-8 character alphanumeric string
 */
function generateVideoUrlString(wistiaId) {
  // Create a simple hash from the wistiaId to ensure consistency
  let hash = 0;
  for (let i = 0; i < wistiaId.length; i++) {
    const char = wistiaId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive number and create a base36 string
  const positiveHash = Math.abs(hash);
  let urlString = positiveHash.toString(36);
  
  // Ensure minimum length of 6 characters
  while (urlString.length < 6) {
    urlString = '0' + urlString;
  }
  
  // Limit to 8 characters for clean URLs
  return urlString.substring(0, 8);
}

exports.handler = async (event, context) => {
  // Get secured CORS headers
  const headers = getSecuredCorsHeaders();

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  try {
    // Cap payload first so we never spend CPU parsing oversized bodies.
    if (event.body && event.body.length > 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large (max 1 MB).' } })
      };
    }
    // Defensive JSON parse — body may be missing or malformed.
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } })
      };
    }
    
    // Support both array of videos and object with videos and page
    let videos, page;
    if (Array.isArray(requestBody)) {
      // Backward compatibility - if just an array is sent, default to 'oz' page
      videos = requestBody;
      page = 'oz';
    } else {
      // New format: { videos: [...], page: 'oz' }
      videos = requestBody.videos || [];
      page = requestBody.page || 'oz';
    }

    if (typeof page !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(page)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } })
      };
    }

    const authResult = await requirePageAuth(event, page);
    if (!authResult.authorized) {
      return authResult.response;
    }
    
    console.log(`Saving ${videos.length} videos for page: ${page}`);
    
    // Validate video data
    if (!Array.isArray(videos)) {
      throw new Error('Videos must be an array');
    }

    // Validate and enhance each video object
    for (const video of videos) {
      const validationError = validateVideoRecord(video);
      if (validationError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: { code: 'BAD_VIDEO', message: validationError } })
        };
      }
      
      // Ensure video has a URL string
      if (!video.urlString) {
        video.urlString = generateVideoUrlString(video.wistiaId);
        console.log(`Generated URL string for video ${video.wistiaId}: ${video.urlString}`);
      }
    }

    // Check for duplicate IDs
    const ids = videos.map(video => video.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate video IDs found');
    }

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`videos:${page}`]);
        await client.query('DELETE FROM videos WHERE page = $1', [page]);
        for (let index = 0; index < videos.length; index++) {
          const video = videos[index];
          await client.query(`INSERT INTO videos (id, wistia_id, title, category, tags, url_string, "order", page, video_url, platform, thumbnail_url)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [video.id, video.wistiaId, video.title, video.category, video.tags || [], video.urlString,
            video.order !== undefined ? video.order : index, page, video.video_url || null,
            video.platform || 'wistia', video.thumbnailUrl || null]);
        }
        await client.query('COMMIT');
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: videos.length, page: page, message: `Videos saved successfully for page: ${page}` })
        };
    } catch (dbError) {
      await client.query('ROLLBACK').catch(() => {});
      throw dbError;
    } finally { client.release(); }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    };
  }
};