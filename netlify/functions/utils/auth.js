/**
 * Authentication Utility for Admin Endpoints
 * 
 * Provides simple token-based authentication to protect admin operations
 * from unauthorized access.
 * 
 * Usage:
 *   const { requireAuth } = require('./utils/auth');
 *   
 *   exports.handler = async (event, context) => {
 *     const authResult = requireAuth(event);
 *     if (!authResult.authorized) {
 *       return authResult.response;
 *     }
 *     // ... rest of handler logic
 *   };
 */

const crypto = require('crypto');
const { verifyPageEditorCredential } = require('../../../lib/page-editor-auth');
const pageStore = require('../../../lib/page-store');

/**
 * Check if request is authorized
 * @param {Object} event - Netlify function event object
 * @returns {Object} - { authorized: boolean, response?: Object }
 */
function requireAuth(event) {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  
  console.log('🔐 Auth check - ADMIN_TOKEN present:', !!ADMIN_TOKEN);
  console.log('🔐 Auth check - Authorization header:', event.headers.authorization ? 'present' : 'missing');

  if (!ADMIN_TOKEN) {
    return {
      authorized: false,
      response: {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: { code: 'ADMIN_NOT_CONFIGURED', message: 'Server configuration error: ADMIN_TOKEN not set. Please configure ADMIN_TOKEN in environment variables.' }
        })
      }
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return {
      authorized: false,
      response: {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: { code: 'AUTH_REQUIRED', message: 'Unauthorized: Missing Authorization header. Please provide admin token.' }
        })
      }
    };
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return {
      authorized: false,
      response: {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'Forbidden: Invalid admin token.' }
        })
      }
    };
  }

  return { authorized: true, headers };
}

/**
 * Authorize a write for exactly one standalone content page.
 * Page-editor credentials never fall back to the site-wide ADMIN_TOKEN.
 */
async function requirePageAuth(event, page) {
  const headers = getSecuredCorsHeaders();
  const provided = (event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
  if (provided) {
    try {
      const digest = crypto.createHash('sha256').update(provided).digest('hex');
      const result = await pageStore.query(
        'SELECT page FROM page_config WHERE page = $1 AND editor_token_hash = $2',
        [page, digest]
      );
      if (result.rows.length) return { authorized: true, page, headers };
    } catch (error) {
      console.error('Page editor credential lookup failed:', error.message);
    }
  }
  const result = verifyPageEditorCredential({
    page,
    headers: event.headers || {}
  });

  if (!result.authorized) {
    return {
      authorized: false,
      response: {
        statusCode: result.status,
        headers,
        body: JSON.stringify({
          error: { code: result.code, message: result.message }
        })
      }
    };
  }

  return { authorized: true, page, headers };
}

/**
 * Get CORS headers (for read-only endpoints)
 * @returns {Object} - Headers object
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
}

/**
 * Get secured CORS headers (for admin endpoints)
 * @returns {Object} - Headers object with restricted CORS
 */
function getSecuredCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

module.exports = {
  requireAuth,
  requirePageAuth,
  getCorsHeaders,
  getSecuredCorsHeaders
};
