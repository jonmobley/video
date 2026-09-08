const crypto = require('crypto');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { PAGE_ID_RE } = require('../lib/page-editor-auth');
const { getDefaultPageConfig } = require('../lib/page-config-defaults');
const { pageSetupUrl } = require('../lib/page-public-path');
const { query } = require('../lib/page-store');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SETUP_TTL_MS = 24 * 60 * 60 * 1000;

function jsonError(status, code, message) {
  return { statusCode: status, body: JSON.stringify({ error: { code, message } }) };
}

exports.handler = async event => {
  const headers = getSecuredCorsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { ...jsonError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.'), headers };
  }
  const auth = requireAuth(event);
  if (!auth.authorized) return auth.response;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { ...jsonError(400, 'BAD_JSON', 'Invalid JSON.'), headers };
  }
  const page = String(body.page || '').trim().toLowerCase();
  if (!PAGE_ID_RE.test(page) || !/^[a-z0-9-]{1,64}$/.test(page)) {
    return { ...jsonError(400, 'BAD_PAGE', 'Use a lowercase show slug.'), headers };
  }

  const setupToken = crypto.randomBytes(32).toString('base64url');
  const digest = hash(setupToken);
  const expires = new Date(Date.now() + SETUP_TTL_MS);
  try {
    const existing = await query('SELECT page FROM page_config WHERE page = $1', [page]);
    if (existing.rows.length === 0) {
      const config = getDefaultPageConfig(page);
      await query(
        `INSERT INTO page_config (
          page, page_title, meta_description, meta_keywords, og_title, og_description,
          canonical_url, presentation, setup_token_hash, setup_token_expires_at, setup_token_used_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)`,
        [
          page, config.page_title, config.meta_description, config.meta_keywords,
          config.og_title, config.og_description, config.canonical_url,
          JSON.stringify(config.presentation), digest, expires
        ]
      );
    } else {
      await query(
        `UPDATE page_config
            SET setup_token_hash = $1, setup_token_expires_at = $2,
                setup_token_used_at = NULL, updated_at = NOW()
          WHERE page = $3`,
        [digest, expires, page]
      );
    }
  } catch (error) {
    console.error('Issue page editor setup failed:', error.message);
    return { ...jsonError(500, 'DB_ERROR', 'Could not create the editor setup link.'), headers };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ page, setup_url: pageSetupUrl(page, setupToken) })
  };
};
