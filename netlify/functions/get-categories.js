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

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

console.log('Supabase initialization:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseKey,
  urlLength: supabaseUrl ? supabaseUrl.length : 0,
  urlStart: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'undefined'
});

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client created successfully');
  } catch (error) {
    console.error('Error creating Supabase client:', error);
  }
}

// Default categories for fallback
// Used when Supabase is unavailable or not configured
// Ensures basic functionality during development and outages
const DEFAULT_CATEGORIES = {
  'oz': [
    { id: 'all', name: 'All Videos', order: 0, page: 'oz' },
    { id: 'chorus', name: 'Chorus', order: 1, page: 'oz' },
    { id: 'principals', name: 'Principals', order: 2, page: 'oz' },
    { id: 'dancers', name: 'Dancers', order: 3, page: 'oz' }
  ],
  'disc': [
    { id: 'all', name: 'All Videos', order: 0, page: 'disc' },
    { id: 'disc', name: 'DISC', order: 1, page: 'disc' }
  ]
};

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
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
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Extract page parameter from query string
    const params = event.queryStringParameters || {};
    const page = params.page || 'oz'; // Default to 'oz' for backward compatibility
    
    console.log(`Fetching categories for page: ${page}`);
    // Try to get categories from Supabase if available
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('page', page)
          .order('order', { ascending: true });

        if (error) {
          console.error('Error fetching categories from Supabase:', error);
          throw error;
        }

        console.log(`Successfully fetched ${data.length} categories from Supabase for page: ${page}`);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(data)
        };
      } catch (dbError) {
        console.error('Database query failed, using default categories:', dbError);
        // Fall back to default categories if database fails
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(DEFAULT_CATEGORIES[page] || [])
        };
      }
    } else {
      // Supabase not configured, return default categories
      console.log('Supabase not configured, returning default categories');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(DEFAULT_CATEGORIES[page] || [])
      };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};