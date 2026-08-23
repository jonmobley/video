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

const { createClient } = require('@supabase/supabase-js');
const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

console.log('Supabase initialization:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseKey
});

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client created successfully');
  } catch (error) {
    console.error('Error creating Supabase client:', error);
  }
}

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
    // Log environment for debugging
    console.log('Function environment:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasSupabase: !!supabase
    });

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
      if (!category.id || !category.name) {
        throw new Error('Invalid category data structure - id and name are required');
      }
      
      // Validate color format (hex color)
      if (category.color && !/^#[0-9A-F]{6}$/i.test(category.color)) {
        throw new Error(`Invalid color format for category ${category.name}. Use hex format like #ff6b6b`);
      }
    }

    // Check for duplicate IDs
    const ids = categories.map(cat => cat.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Duplicate category IDs found');
    }

    // Try to save to Supabase if available
    if (supabase) {
      try {
        const showInDropdownValue = categoryScope === 'songs';
        
        const supabaseCategories = categories.map((category, index) => ({
          id: `${page}-${category.id}`,
          name: category.name,
          category_key: category.id,
          color: category.color || null,
          order: category.order !== undefined ? category.order : index,
          page: page,
          show_in_dropdown: showInDropdownValue
        }));

        console.log('Attempting atomic replace via RPC:', supabaseCategories.length);
        const { error: rpcError } = await supabase.rpc('replace_page_categories', {
          p_page: page,
          p_categories: supabaseCategories,
          p_show_in_dropdown: showInDropdownValue
        });

        if (rpcError) {
          console.error('Error in replace_page_categories RPC:', rpcError);
          throw rpcError;
        }

        console.log('Successfully saved categories to Supabase');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, count: categories.length, page: page, message: `Categories saved successfully for page: ${page}` })
        };
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        throw new Error(`Failed to save categories: ${dbError.message}`);
      }
    } else {
      // Supabase not configured
      console.log('Supabase not configured, categories not persisted');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          count: categories.length, 
          message: 'Categories validated but not persisted (Supabase not configured)',
          temporary: true
        })
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