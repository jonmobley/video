/**
 * Netlify Function: save-categories
 * 
 * Purpose: Saves category data to Supabase, replacing existing categories for a page
 * 
 * Request Body:
 *   - Legacy format: Array of category objects (defaults to 'oz' page)
 *   - New format: { categories: Array, page: String }
 * 
 * Category Object Requirements:
 *   - id: Unique identifier (e.g., 'dancers', 'chorus')
 *   - name: Display name (e.g., 'Dancers', 'Chorus')
 *   - color (optional): Hex color for visual styling (#RRGGBB)
 *   - order (optional): Display order in navigation
 * 
 * Features:
 *   - Validates hex color format
 *   - Multi-page support with page isolation
 *   - Replaces all categories for the specified page
 *   - Maintains referential integrity with videos
 */

const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');
const { getPool } = require('../lib/page-store');

exports.handler = async (event, context) => {
  // Get secured CORS headers
  const headers = getSecuredCorsHeaders();

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } })
    };
  }

  try {
    if (event.body && event.body.length > 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large (max 1 MB).' } })
      };
    }
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } })
      };
    }
    
    // Support both array of categories and object with categories and page
    let categories, page, categoryScope;
    if (Array.isArray(requestBody)) {
      // Backward compatibility - if just an array is sent, default to 'oz' page
      categories = requestBody;
      page = 'oz';
      categoryScope = 'songs'; // Default to songs for backward compatibility
    } else {
      // New format: { categories: [...], page: 'oz', category_scope: 'songs' | 'tags' }
      categories = requestBody.categories || [];
      page = requestBody.page || 'oz';
      categoryScope = requestBody.category_scope || 'songs'; // Explicit scope from client
    }

    if (typeof page !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(page)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: { code: 'BAD_PAGE', message: 'Invalid page ID.' } })
      };
    }

    const authResult = await requirePageAuth(event, page);
    if (!authResult.authorized) {
      return authResult.response;
    }
    
    console.log(`Saving ${categories.length} categories for page: ${page}, scope: ${categoryScope}`);
    
    // Validate category data
    if (!Array.isArray(categories)) {
      throw new Error('Categories must be an array');
    }

    // Validate each category object
    for (const category of categories) {
      if (typeof category.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(category.id) ||
          typeof category.name !== 'string' || !category.name.trim() || category.name.length > 80) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: { code: 'BAD_CATEGORY', message: 'Invalid category id or name.' } })
        };
      }
      
      // Validate color format (hex color)
      if (category.color && !/^#[0-9A-F]{6}$/i.test(category.color)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: { code: 'BAD_COLOR', message: `Invalid color format for category ${category.name}. Use hex format like #ff6b6b` } })
        };
      }
    }

    // Check for duplicate IDs
    const ids = categories.map(cat => cat.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate category IDs found');
    }

    const client = await getPool().connect();
    try {
        const showInDropdownValue = categoryScope === 'songs';
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`categories:${page}`]);
        await client.query('DELETE FROM categories WHERE page = $1 AND show_in_dropdown = $2', [page, showInDropdownValue]);
        for (let index = 0; index < categories.length; index++) {
          const category = categories[index];
          await client.query(`INSERT INTO categories (id, name, category_key, color, "order", page, show_in_dropdown)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [`${page}-${categoryScope}-${category.id}`, category.name, category.id, category.color || null,
            category.order !== undefined ? category.order : index, page, showInDropdownValue]);
        }
        await client.query('COMMIT');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: categories.length, page: page, message: `Categories saved successfully for page: ${page}` })
        };
    } catch (dbError) {
      await client.query('ROLLBACK').catch(() => {});
      throw dbError;
    } finally { client.release(); }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } })
    };
  }
};