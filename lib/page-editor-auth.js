const crypto = require('crypto');

const PAGE_ID_RE = /^[a-z0-9_-]{1,64}$/;

function getPageEditorEnvKey(page) {
  if (typeof page !== 'string' || !PAGE_ID_RE.test(page)) return null;
  return `${page.toUpperCase().replace(/-/g, '_')}_EDITOR_TOKEN`;
}

function getAuthorizationHeader(headers = {}) {
  return headers.authorization || headers.Authorization || '';
}

function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

function constantTimeEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left || '')).digest();
  const b = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyPageEditorCredential({ page, headers = {}, env = process.env }) {
  const envKey = getPageEditorEnvKey(page);
  if (!envKey) {
    return {
      authorized: false,
      status: 400,
      code: 'BAD_PAGE',
      message: 'Invalid page ID.'
    };
  }

  const configuredToken = env[envKey];
  if (!configuredToken) {
    return {
      authorized: false,
      status: 500,
      code: 'PAGE_EDITOR_NOT_CONFIGURED',
      message: 'Editor access is not configured for this page.'
    };
  }

  const providedToken = extractBearerToken(getAuthorizationHeader(headers));
  if (!providedToken) {
    return {
      authorized: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'A page editor password is required.'
    };
  }

  if (!constantTimeEqual(providedToken, configuredToken)) {
    return {
      authorized: false,
      status: 403,
      code: 'PAGE_FORBIDDEN',
      message: 'This password cannot edit this page.'
    };
  }

  return { authorized: true, page };
}

module.exports = {
  PAGE_ID_RE,
  getPageEditorEnvKey,
  verifyPageEditorCredential
};