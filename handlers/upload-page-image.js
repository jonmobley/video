/**
 * Upload Open Graph / share images for a show page.
 * Bytes live in Postgres (page_config.og_image_data) and are served at
 * /api/page-image/:page.
 */

const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { query } = require('../lib/page-store');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function isMatchingImageSignature(imageBuffer, contentType) {
  if (contentType === 'image/png') {
    return imageBuffer.length >= 8 &&
      imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    return imageBuffer.length >= 3 &&
      imageBuffer[0] === 0xFF &&
      imageBuffer[1] === 0xD8 &&
      imageBuffer[2] === 0xFF;
  }
  if (contentType === 'image/webp') {
    return imageBuffer.length >= 12 &&
      imageBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      imageBuffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

exports.handler = async (event) => {
  const headers = getSecuredCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  const authResult = requireAuth(event);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    if (event.body && event.body.length > 8 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' } })
      };
    }
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } })
      };
    }
    const { page, image, contentType } = body;

    if (!page || !image || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'MISSING_FIELDS', message: 'Missing required fields: page, image, contentType.' } })
      };
    }
    if (typeof page !== 'string' || page.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(page)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } })
      };
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: { code: 'UNSUPPORTED_TYPE', message: `Invalid image type. Allowed: ${ALLOWED_TYPES.join(', ')}.` } })
      };
    }

    const imageBuffer = Buffer.from(image, 'base64');
    if (imageBuffer.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'EMPTY_FILE', message: 'Image data is empty.' } })
      };
    }

    if (imageBuffer.length > MAX_FILE_SIZE) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'FILE_TOO_LARGE', message: `Image too large. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.` } })
      };
    }

    if (!isMatchingImageSignature(imageBuffer, contentType)) {
      return {
        statusCode: 415,
        headers,
        body: JSON.stringify({ error: { code: 'UNSUPPORTED_TYPE', message: 'Image bytes do not match the declared type.' } })
      };
    }

    const imageUrl = `/api/page-image/${page}?v=${Date.now()}`;
    const result = await query(
      `UPDATE page_config
       SET og_image_url = $2, og_image_data = $3, og_image_content_type = $4, updated_at = NOW()
       WHERE page = $1
       RETURNING page, accent_color, page_title, meta_description, meta_keywords, canonical_url,
                 og_title, og_description, og_image_url, coming_soon_image_url,
                 twitter_title, twitter_description, presentation`,
      [page, imageUrl, imageBuffer, contentType]
    );

    if (!result.rowCount) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: { code: 'PAGE_NOT_FOUND', message: 'That show page does not exist.' } })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        imageUrl,
        pageConfig: result.rows[0],
        message: 'Image uploaded successfully'
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    };
  }
};
