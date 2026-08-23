/**
 * Netlify Function: get-page-config
 * 
 * Purpose: Retrieves page configuration including accent colors and titles
 * 
 * Query Parameters:
 *   - page (optional): Specific page ID to retrieve (e.g., 'oz', 'disc')
 *                     If omitted, returns all page configurations
 * 
 * Returns:
 *   - Single page config object if page parameter provided
 *   - Array of all page configs if no page parameter
 *   - Default config if specific page not found
 */

const { getCorsHeaders } = require('./utils/auth');
const { getDefaultPageConfig } = require('../../lib/page-config-defaults');
const { query } = require('../../lib/page-store');

function mergePageConfig(config) {
  const defaults = getDefaultPageConfig(config.page);
  // Defense in depth: do not leak secrets even if a future query changes.
  const { editor_token_hash, setup_token_hash, setup_token_expires_at, setup_token_used_at, ...publicConfig } = config;
  const savedPresentation = config.presentation &&
    typeof config.presentation === 'object' &&
    !Array.isArray(config.presentation)
    ? config.presentation
    : {};

  return {
    ...defaults,
    ...publicConfig,
    presentation: {
      ...defaults.presentation,
      ...savedPresentation
    }
  };
}

// Never add credential hashes to this projection: this function is public.
const PUBLIC_FIELDS = 'page, accent_color, page_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image_url, coming_soon_image_url, twitter_title, twitter_description, presentation';

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = getCorsHeaders();

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  try {
    // Get page parameter from query string
    const page = event.queryStringParameters?.page;
    
    const result = page
      ? await query(`SELECT ${PUBLIC_FIELDS} FROM page_config WHERE page = $1`, [page])
      : await query(`SELECT ${PUBLIC_FIELDS} FROM page_config ORDER BY page`);
    const responseData = page
      ? (result.rows.length ? mergePageConfig(result.rows[0]) : getDefaultPageConfig(page))
      : result.rows.map(mergePageConfig);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
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

exports.mergePageConfig = mergePageConfig;
exports.PUBLIC_FIELDS = PUBLIC_FIELDS;
