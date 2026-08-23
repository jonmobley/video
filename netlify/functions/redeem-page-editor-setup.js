const crypto = require('crypto');
const { getSecuredCorsHeaders } = require('./utils/auth');
const { PAGE_ID_RE } = require('../../lib/page-editor-auth');
const { query } = require('../../lib/page-store');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

exports.handler = async event => {
  const headers = getSecuredCorsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }) };
  let body; try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const page = String(body.page || '').toLowerCase(), token = String(body.token || '');
  if (!PAGE_ID_RE.test(page) || !token) return { statusCode: 400, headers, body: JSON.stringify({ error: { code: 'BAD_SETUP', message: 'Invalid setup link.' } }) };
  const editorToken = crypto.randomBytes(32).toString('base64url');
  let updated;
  try {
    updated = await query(`UPDATE page_config
      SET editor_token_hash = $1, setup_token_used_at = NOW(), setup_token_hash = NULL, updated_at = NOW()
      WHERE page = $2 AND setup_token_hash = $3 AND setup_token_used_at IS NULL AND setup_token_expires_at > NOW()
      RETURNING page`, [hash(editorToken), page, hash(token)]);
  } catch (error) {
    console.error('Page setup redemption failed:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: { code: 'DB_ERROR', message: 'Could not redeem setup link.' } }) };
  }
  if (updated.rows.length !== 1) return { statusCode: 403, headers, body: JSON.stringify({ error: { code: 'SETUP_EXPIRED', message: 'This setup link is expired or already used.' } }) };
  return { statusCode: 200, headers, body: JSON.stringify({ page, editor_token: editorToken }) };
};