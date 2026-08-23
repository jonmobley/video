/**
 * Netlify Function: get-categories
 * 
 * Purpose: Retrieves category data for organizing videos by type
 * 
 * Query Parameters:
 *   - page (optional): Page identifier ('oz' or 'disc'). Defaults to 'oz'
 * 
 * Returns:
 *   - Array of category objects with id, name, order, and color
 *   - Falls back to hardcoded defaults if database is unavailable
 * 
 * Features:
 *   - Multi-page support with page-specific categories
 *   - Ordered by 'order' field for consistent display
 *   - Graceful fallback behavior
 */

const { query } = require('../../lib/page-store');

// Default categories for fallback
// Used when Supabase is unavailable or not configured
// Ensures basic functionality during development and outages
// 
// IMPORTANT: show_in_dropdown field determines where items appear:
//   - show_in_dropdown: true  = Categories/Songs (appear in dropdown menu)
//   - show_in_dropdown: false = Tags/Audiences (appear as filter pills)
const DEFAULT_CATEGORIES = {
  'oz': [
    // Song categories (show in dropdown)
    { id: 'oz', name: 'Oz', order: 1, page: 'oz', show_in_dropdown: true },
    { id: 'munchkinland', name: 'Munchkinland', order: 2, page: 'oz', show_in_dropdown: true },
    { id: 'jitterbug', name: 'Jitterbug', order: 3, page: 'oz', show_in_dropdown: true },
    { id: 'yellowbrickroad', name: 'Yellow Brick Road', order: 4, page: 'oz', show_in_dropdown: true },
    // Audience tags (show as filter pills)
    { id: 'chorus', name: 'Chorus', order: 10, page: 'oz', show_in_dropdown: false },
    { id: 'kids', name: 'Kids', order: 11, page: 'oz', show_in_dropdown: false },
    { id: 'dancers', name: 'Dancers', order: 12, page: 'oz', show_in_dropdown: false }
  ],
  'disc': [
    { id: 'conflict', name: 'Conflict', order: 1, page: 'disc', show_in_dropdown: true },
    { id: 'adapted', name: 'Adapted', order: 2, page: 'disc', show_in_dropdown: true }
  ],
  'vertical': [
    { id: 'performance', name: 'Performance', order: 1, page: 'vertical', show_in_dropdown: true }
  ]
};

/**
 * Generate a simple hash for ETag
 */
function generateHash(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

exports.handler = async (event, context) => {
  // Enable CORS with caching headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200' // 10 min cache, 20 min stale
  };

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
    // Extract page parameter from query string
    const params = event.queryStringParameters || {};
    const page = params.page || 'oz'; // Default to 'oz' for backward compatibility
    
    console.log(`Fetching categories for page: ${page}`);
    try {
        const result = await query('SELECT id, name, category_key, color, "order", page, icon, show_in_dropdown FROM categories WHERE page = $1 ORDER BY "order" ASC', [page]);
        const data = result.rows;

        console.log(`Successfully fetched ${data.length} categories for page: ${page}`);
        
        // Transform data to use category_key as id if available
        const transformedData = data.map(cat => ({
          id: cat.category_key || cat.id.replace(`${page}-`, ''), // Use category_key or strip page prefix
          name: cat.name,
          color: cat.color,
          order: cat.order,
          page: cat.page,
          icon: cat.icon,
          show_in_dropdown: cat.show_in_dropdown === true || cat.show_in_dropdown === 't' // Explicitly check for true or PostgreSQL 't'
        }));
        
        const etag = generateHash(transformedData);
        const clientEtag = event.headers['if-none-match'];
        
        if (clientEtag === etag) {
          return {
            statusCode: 304,
            headers: { ...headers, 'ETag': etag },
            body: ''
          };
        }
        
        return {
          statusCode: 200,
          headers: { ...headers, 'ETag': etag },
          body: JSON.stringify(transformedData)
        };
    } catch (dbError) {
        console.error('Database query failed, using default categories:', dbError);
        // Fall back to default categories if database fails
        const fallbackData = DEFAULT_CATEGORIES[page] || [];
        const etag = generateHash(fallbackData);
        const clientEtag = event.headers['if-none-match'];
        
        if (clientEtag === etag) {
          return {
            statusCode: 304,
            headers: { ...headers, 'ETag': etag },
            body: ''
          };
        }
        
        return {
          statusCode: 200,
          headers: { ...headers, 'ETag': etag },
          body: JSON.stringify(fallbackData)
        };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    };
  }
};