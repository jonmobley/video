const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { PAGE_ID_RE } = require('../../lib/page-editor-auth');
const { getDefaultPageConfig } = require('../../lib/page-config-defaults');

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

exports.handler = async event => {
  const headers = getSecuredCorsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }) };
  const auth = requireAuth(event);
  if (!auth.authorized) return auth.response;
  if (!supabase) return { statusCode: 500, headers, body: JSON.stringify({ error: { code: 'DB_NOT_CONFIGURED', message: 'Page storage is not configured.' } }) };
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
  const { error } = await supabase.from('page_config').insert({
    page, page_title: title, meta_description: `${title} - Video Collection`,
    meta_keywords: `${page}, videos, collection`, og_title: title,
    og_description: `${title} - Video Collection`, canonical_url: `/show/${page}`,
    presentation: config.presentation,
    setup_token_hash: hash(setupToken),
    setup_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
  if (error) {
    const duplicate = error.code === '23505';
    return { statusCode: duplicate ? 409 : 500, headers, body: JSON.stringify({ error: { code: duplicate ? 'PAGE_EXISTS' : 'DB_ERROR', message: duplicate ? 'That show slug already exists.' : 'Could not create the show.' } }) };
  }
  const origin = event.headers?.origin || (event.headers?.host ? `${event.headers['x-forwarded-proto'] || 'https'}://${event.headers.host}` : '');
  return { statusCode: 201, headers, body: JSON.stringify({ page, title, setup_url: `${origin}/show/${page}?setup=${encodeURIComponent(setupToken)}` }) };
};