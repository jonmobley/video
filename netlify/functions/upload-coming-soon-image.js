/**
 * Netlify Function: upload-coming-soon-image
 *
 * Stores page-template artwork and updates only that page's
 * coming_soon_image_url setting. This endpoint intentionally uses the
 * page-scoped editor credential rather than the global admin token.
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { buildPageConfigWrite } = require('../../lib/page-config-defaults');
const { query } = require('../../lib/page-store');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function response(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function decodeImage(image) {
  if (typeof image !== 'string' || !image) return null;

  // Accept the data URL produced by FileReader, but do not trust its MIME
  // type; contentType is validated separately and the blob metadata uses it.
  const dataUrlMatch = image.match(/^data:[^;,]+;base64,(.*)$/s);
  const base64 = dataUrlMatch ? dataUrlMatch[1] : image;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) return null;

  const buffer = Buffer.from(base64, 'base64');
  return buffer.length > 0 ? buffer : null;
}

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
    return response(405, headers, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }
    });
  }

  let body;
  try {
    if (event.body && event.body.length > MAX_REQUEST_SIZE) {
      return response(413, headers, {
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' }
      });
    }
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, headers, {
      error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' }
    });
  }

  const { page, image, contentType } = body;
  if (!page || !image || !contentType) {
    return response(400, headers, {
      error: { code: 'MISSING_FIELDS', message: 'Missing required fields: page, image, contentType.' }
    });
  }
  if (typeof page !== 'string' || page.length > 64 || !/^[a-z0-9_-]+$/.test(page)) {
    return response(400, headers, {
      error: { code: 'BAD_PAGE', message: 'Invalid page ID.' }
    });
  }

  const authResult = await requirePageAuth(event, page);
  if (!authResult.authorized) return authResult.response;

  if (!ALLOWED_TYPES.includes(contentType)) {
    return response(415, headers, {
      error: {
        code: 'UNSUPPORTED_TYPE',
        message: `Invalid image type. Allowed: ${ALLOWED_TYPES.join(', ')}.`
      }
    });
  }

  const imageBuffer = decodeImage(image);
  if (!imageBuffer) {
    return response(400, headers, {
      error: { code: 'EMPTY_FILE', message: 'Image data is empty or invalid.' }
    });
  }
  if (!isMatchingImageSignature(imageBuffer, contentType)) {
    return response(415, headers, {
      error: { code: 'IMAGE_CONTENT_MISMATCH', message: 'Image data does not match the selected file type.' }
    });
  }
  if (imageBuffer.length > MAX_FILE_SIZE) {
    return response(413, headers, {
      error: { code: 'FILE_TOO_LARGE', message: `Image too large. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.` }
    });
  }

  try {
    const extension = contentType === 'image/jpeg' || contentType === 'image/jpg'
      ? 'jpg'
      : contentType.split('/')[1];
    const filename = `coming-soon-${page}.${extension}`;
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('page-images');
    await store.set(filename, imageBuffer, {
      metadata: {
        contentType,
        page,
        purpose: 'coming-soon',
        uploadedAt: new Date().toISOString()
      }
    });

    const imageUrl = `/.netlify/blobs/page-images/${filename}`;
    const existing = await query('SELECT page FROM page_config WHERE page = $1', [page]);
    const config = buildPageConfigWrite(page, { coming_soon_image_url: imageUrl }, existing.rows[0]);
    const result = await query(`INSERT INTO page_config (page, accent_color, page_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image_url, coming_soon_image_url, twitter_title, twitter_description, presentation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (page) DO UPDATE SET coming_soon_image_url = EXCLUDED.coming_soon_image_url, updated_at = NOW()
      RETURNING page, accent_color, page_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image_url, coming_soon_image_url, twitter_title, twitter_description, presentation`,
      [config.page, config.accent_color, config.page_title, config.meta_description, config.meta_keywords,
        config.canonical_url, config.og_title, config.og_description, config.og_image_url,
        config.coming_soon_image_url, config.twitter_title, config.twitter_description, JSON.stringify(config.presentation)]);

    return response(200, headers, {
      imageUrl,
      pageConfig: result.rows[0],
      message: 'Coming Soon image uploaded successfully.'
    });
  } catch (error) {
    console.error('Coming Soon image upload failed:', error);
    return response(500, headers, {
      error: { code: 'INTERNAL', message: 'Failed to upload the Coming Soon image.' }
    });
  }
};

exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
exports.ALLOWED_TYPES = ALLOWED_TYPES;
exports.decodeImage = decodeImage;
exports.isMatchingImageSignature = isMatchingImageSignature;