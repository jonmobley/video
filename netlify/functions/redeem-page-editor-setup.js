const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getSecuredCorsHeaders } = require('./utils/auth');
const { PAGE_ID_RE } = require('../../lib/page-editor-auth');
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

exports.handler = async event => {
  const headers = getSecuredCorsHeaders();
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }) };
  let body; try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
  const page = String(body.page || '').toLowerCase(), token = String(body.token || '');
  if (!supabase || !PAGE_ID_RE.test(page) || !token) return { statusCode: 400, headers, body: JSON.stringify({ error: { code: 'BAD_SETUP', message: 'Invalid setup link.' } }) };
  const editorToken = crypto.randomBytes(32).toString('base64url');
  const { data, error: updateError } = await supabase.from('page_config').update({
    editor_token_hash: hash(editorToken),
    setup_token_used_at: new Date().toISOString(),
    setup_token_hash: null
  }).eq('page', page).eq('setup_token_hash', hash(token))
    .is('setup_token_used_at', null)
    .gt('setup_token_expires_at', new Date().toISOString())
    .select('page');
  if (updateError || !data || data.length !== 1) return { statusCode: 403, headers, body: JSON.stringify({ error: { code: 'SETUP_EXPIRED', message: 'This setup link is expired or already used.' } }) };
  return { statusCode: 200, headers, body: JSON.stringify({ page, editor_token: editorToken }) };
};