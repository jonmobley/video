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

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

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

  // If no admin token is configured, deny access with helpful message
  if (!ADMIN_TOKEN) {
    return {
      authorized: false,
      response: {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error: ADMIN_TOKEN not set. Please configure ADMIN_TOKEN in environment variables.' 
        })
      }
    };
  }

  // Get authorization header
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return {
      authorized: false,
      response: {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          error: 'Unauthorized: Missing Authorization header. Please provide admin token.' 
        })
      }
    };
  }

  // Support both "Bearer TOKEN" and just "TOKEN" formats
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  if (token !== ADMIN_TOKEN) {
    return {
      authorized: false,
      response: {
        statusCode: 403,
        headers,
        body: JSON.stringify({ 
          error: 'Forbidden: Invalid admin token' 
        })
      }
    };
  }

  return { authorized: true, headers };
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
  getCorsHeaders,
  getSecuredCorsHeaders
};
