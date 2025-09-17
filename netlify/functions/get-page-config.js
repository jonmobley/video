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

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
    // Get page parameter from query string
    const page = event.queryStringParameters?.page;
    
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
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            page: page,
            accent_color: '#008f67',  // Default green color
            page_title: page.charAt(0).toUpperCase() + page.slice(1),  // Default title
            meta_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
            meta_keywords: `${page}, videos, collection`,
            og_title: page.charAt(0).toUpperCase() + page.slice(1),
            og_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
            og_image_url: '/assets/og-image.png',
            twitter_title: null,
            twitter_description: null,
            canonical_url: `https://vidsharepro.netlify.app/${page}.html`
          })
        };
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: error.message })
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
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
