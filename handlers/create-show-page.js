const crypto = require('crypto');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { PAGE_ID_RE } = require('../lib/page-editor-auth');
const { getDefaultPageConfig } = require('../lib/page-config-defaults');
const { query } = require('../lib/page-store');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

exports.handler = async event => {
  const headers = getSecuredCorsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }) };
  const auth = requireAuth(event);
  if (!auth.authorized) return auth.response;
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: { code: 'BAD_JSON', message: 'Invalid JSON.' } }) }; }
  const page = String(body.page || '').trim().toLowerCase();
  const title = String(body.title || '').trim();
  if (!PAGE_ID_RE.test(page) || !/^[a-z0-9-]{1,64}$/.test(page) || !title || title.length > 160) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Use a unique lowercase URL slug and a title.' } }) };
  }
  const setupToken = crypto.randomBytes(32).toString('base64url');
  const config = getDefaultPageConfig(page);
  config.page_title = title;
  config.presentation = { ...config.presentation, empty_state_enabled: true };
  try {
    await query(`INSERT INTO page_config (page, page_title, meta_description, meta_keywords, og_title, og_description, canonical_url, presentation, setup_token_hash, setup_token_expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [page, title, `${title} - Video Collection`, `${page}, videos, collection`, title,
      `${title} - Video Collection`, `/show/${page}`, JSON.stringify(config.presentation),
      hash(setupToken), new Date(Date.now() + 24 * 60 * 60 * 1000)]);
  } catch (error) {
    const duplicate = error.code === '23505';
    return { statusCode: duplicate ? 409 : 500, headers, body: JSON.stringify({ error: { code: duplicate ? 'PAGE_EXISTS' : 'DB_ERROR', message: duplicate ? 'That show slug already exists.' : 'Could not create the show.' } }) };
  }
  let configuredOrigin = String(process.env.PUBLIC_ORIGIN || process.env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
  if (configuredOrigin === '*') configuredOrigin = '';
  const setupPath = `/show/${page}?setup=${encodeURIComponent(setupToken)}`;
  return { statusCode: 201, headers, body: JSON.stringify({ page, title, setup_url: configuredOrigin ? `${configuredOrigin}${setupPath}` : setupPath }) };
};