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

// Default page configurations
const defaultConfigs = {
  oz: {
    page: 'oz',
    accent_color: '#008f67',
    page_title: 'Oz',
    meta_description: 'Oz - Video Collection',
    meta_keywords: 'oz, videos, collection',
    og_title: 'Oz',
    og_description: 'Oz - Video Collection',
    og_image_url: '/assets/og-image.png',
    twitter_title: null,
    twitter_description: null,
    canonical_url: 'https://vidsharepro.netlify.app/oz.html'
  },
  disc: {
    page: 'disc',
    accent_color: '#008f67',
    page_title: 'Disc',
    meta_description: 'Disc - Video Collection',
    meta_keywords: 'disc, videos, collection',
    og_title: 'Disc',
    og_description: 'Disc - Video Collection',
    og_image_url: '/assets/og-image.png',
    twitter_title: null,
    twitter_description: null,
    canonical_url: 'https://vidsharepro.netlify.app/disc.html'
  }
};

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
      body: JSON.stringify({ error: 'Method not allowed' })
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
        const config = defaultConfigs[page] || {
          page: page,
          accent_color: '#008f67',
          page_title: page.charAt(0).toUpperCase() + page.slice(1),
          meta_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
          meta_keywords: `${page}, videos, collection`,
          og_title: page.charAt(0).toUpperCase() + page.slice(1),
          og_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
          og_image_url: '/assets/og-image.png',
          twitter_title: null,
          twitter_description: null,
          canonical_url: `https://vidsharepro.netlify.app/${page}.html`
        };
        
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
          body: JSON.stringify(Object.values(defaultConfigs))
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
        const config = defaultConfigs[page] || {
          page: page,
          accent_color: '#008f67',
          page_title: page.charAt(0).toUpperCase() + page.slice(1),
          meta_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
          meta_keywords: `${page}, videos, collection`,
          og_title: page.charAt(0).toUpperCase() + page.slice(1),
          og_description: `${page.charAt(0).toUpperCase() + page.slice(1)} - Video Collection`,
          og_image_url: '/assets/og-image.png',
          twitter_title: null,
          twitter_description: null,
          canonical_url: `https://vidsharepro.netlify.app/${page}.html`
        };
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(config)
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
