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

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/auth');
const { getDefaultPageConfig } = require('../../lib/page-config-defaults');

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
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
    
    // If Supabase is not configured, return default configs
    if (!supabase) {
      console.log('Supabase not configured, returning default page config');
      
      if (page) {
        // Return specific page config or generate default
        const config = getDefaultPageConfig(page);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(config)
        };
      } else {
        // Return all default configs
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(['oz', 'disc', 'seussical'].map(getDefaultPageConfig))
        };
      }
    }
    
    // Supabase is available, query the database
    let query = supabase
      .from('page_config')
      .select('*');
    
    // If specific page requested, filter by it
    if (page) {
      query = query.eq('page', page).single();
    }
    
    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      
      // If page not found, return default configuration
      // This ensures the app continues to work even if page_config entry is missing
      if (error.code === 'PGRST116' && page) {
        const config = getDefaultPageConfig(page);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(config)
        };
      }

      // A public page should still receive its known configuration when the
      // database is temporarily unavailable. This keeps page templates,
      // including Coming Soon artwork, usable during a transient read outage.
      if (page) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(getDefaultPageConfig(page))
        };
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: { code: 'DB_ERROR', message: 'Database error.' } })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
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
